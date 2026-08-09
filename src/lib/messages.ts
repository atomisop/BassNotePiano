import { prisma } from "@/lib/prisma";
import { sendEmailIfEnabled } from "@/lib/notifications";
import { getAppUrl } from "@/lib/email";
import { isFriend, getFriendsList, SocialError } from "@/lib/social";

const MAX_MESSAGE_LENGTH = 2000;

// A typing row older than this is treated as stale rather than actively
// typing — there's no explicit "stopped typing" write, so recency is the
// only signal. Comfortably longer than the 2.5s active-thread poll interval
// so a normal typing cadence never flickers off between polls.
const TYPING_STALE_MS = 4_000;

async function isBlockedEitherWay(userIdA: string, userIdB: string): Promise<boolean> {
  const block = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: userIdA, blockedId: userIdB },
        { blockerId: userIdB, blockedId: userIdA },
      ],
    },
  });
  return Boolean(block);
}

/**
 * Friendship gate, extended: an ADMIN can message (and be messaged back by)
 * anyone, no friend request needed — this is what makes the admin
 * messaging center work, and lets the recipient reply from their normal
 * Messages inbox. Still respects blocks either way (see isBlockedEitherWay
 * at each call site) — being an admin doesn't override a user's own choice
 * to block that account.
 */
async function canConverse(userIdA: string, userIdB: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    prisma.user.findUnique({ where: { id: userIdA }, select: { role: true } }),
    prisma.user.findUnique({ where: { id: userIdB }, select: { role: true } }),
  ]);
  if (a?.role === "ADMIN" || b?.role === "ADMIN") return true;
  return isFriend(userIdA, userIdB);
}

// 1-on-1 messaging is restricted to friends — unless either party is an
// admin, in which case it's always allowed (the admin messaging center
// needs to reach anyone, not just friends). Also gives this a natural
// spam/safety boundary without a separate moderation layer.
export async function sendMessage(senderId: string, recipientId: string, body: string) {
  const trimmed = body.trim();
  if (!trimmed) throw new SocialError("Message can't be empty.");
  if (trimmed.length > MAX_MESSAGE_LENGTH) throw new SocialError(`Message is too long (${MAX_MESSAGE_LENGTH} characters max).`);
  if (senderId === recipientId) throw new SocialError("You can't message yourself.");

  if (!(await canConverse(senderId, recipientId))) throw new SocialError("You can only message friends.");
  if (await isBlockedEitherWay(senderId, recipientId)) throw new SocialError("You can't message this user.");

  const message = await prisma.message.create({ data: { senderId, recipientId, body: trimmed } });

  // A message landing is a much stronger signal than "typing" — clear it
  // immediately rather than waiting out TYPING_STALE_MS.
  await prisma.typingStatus.deleteMany({ where: { senderId, recipientId } });

  // No in-app Notification row here on purpose — messages already have
  // their own separate unread surface (Messages nav badge + conversation
  // list). Still emails if the recipient opted in, since they might not be
  // on the site at all when it arrives.
  const sender = await prisma.user.findUnique({ where: { id: senderId }, select: { name: true, username: true } });
  await sendEmailIfEnabled(
    recipientId,
    "social",
    "New message",
    `${sender?.name ?? (sender?.username ? `@${sender.username}` : "Someone")} sent you a message.`,
    { label: "Click here to reply", url: getAppUrl(`/messages?with=${senderId}`) },
  );

  return message;
}

export interface ConversationSummary {
  friendId: string;
  friendUsername: string | null;
  friendName: string | null;
  friendImage: string | null;
  lastMessageBody: string | null;
  lastMessageAt: Date | null;
  unreadCount: number;
  isPinned: boolean;
  pinOrder: number | null;
  isTyping: boolean;
}

type ConversationPartner = { id: string; username: string | null; name: string | null; image: string | null };

/**
 * Conversation partners beyond friends: threads that exist only because an
 * admin bypassed the friend gate (see canConverse above). For an admin
 * caller this is "everyone they've ever exchanged a message with" — the
 * admin messaging center's own inbox, since the admin typically has no
 * friends of their own. For a regular user it's "any admin who has
 * messaged them," so that conversation shows up in their normal Messages
 * inbox even without a friend request. Derived from actual Message rows
 * rather than a stored relation — there's no other durable record of an
 * admin-initiated thread.
 */
async function getAdminThreadPartners(userId: string): Promise<ConversationPartner[]> {
  const self = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });

  const rows = await prisma.message.findMany({
    where: { OR: [{ senderId: userId }, { recipientId: userId }] },
    select: {
      senderId: true,
      recipientId: true,
      sender: { select: { id: true, username: true, name: true, image: true, role: true } },
      recipient: { select: { id: true, username: true, name: true, image: true, role: true } },
    },
  });

  const partners = new Map<string, ConversationPartner>();
  for (const row of rows) {
    const other = row.senderId === userId ? row.recipient : row.sender;
    if (other.id === userId) continue; // messaging yourself isn't possible, but guard anyway
    // Admin caller: every actual partner counts. Regular caller: only admin partners.
    if (self?.role !== "ADMIN" && other.role !== "ADMIN") continue;
    partners.set(other.id, { id: other.id, username: other.username, name: other.name, image: other.image });
  }
  return Array.from(partners.values());
}

/** One row per friend (plus any admin-bypassed thread), newest activity first — the conversation list view. */
export async function getConversations(userId: string): Promise<ConversationSummary[]> {
  const [friends, adminPartners, pinnedRows, typingRows] = await Promise.all([
    getFriendsList(userId),
    getAdminThreadPartners(userId),
    prisma.pinnedConversation.findMany({ where: { userId }, select: { friendId: true, pinOrder: true } }),
    prisma.typingStatus.findMany({
      where: { recipientId: userId, updatedAt: { gte: new Date(Date.now() - TYPING_STALE_MS) } },
      select: { senderId: true },
    }),
  ]);

  const friendIds = new Set(friends.map((f) => f.id));
  const partners: ConversationPartner[] = [...friends, ...adminPartners.filter((p) => !friendIds.has(p.id))];

  const pinnedByFriendId = new Map(pinnedRows.map((p) => [p.friendId, p.pinOrder]));
  const typingFriendIds = new Set(typingRows.map((t) => t.senderId));

  const summaries = await Promise.all(
    partners.map(async (friend): Promise<ConversationSummary> => {
      const [lastMessage, unreadCount] = await Promise.all([
        prisma.message.findFirst({
          where: {
            OR: [
              { senderId: userId, recipientId: friend.id },
              { senderId: friend.id, recipientId: userId },
            ],
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.message.count({ where: { senderId: friend.id, recipientId: userId, readAt: null } }),
      ]);

      return {
        friendId: friend.id,
        friendUsername: friend.username,
        friendName: friend.name,
        friendImage: friend.image,
        lastMessageBody: lastMessage?.body ?? null,
        lastMessageAt: lastMessage?.createdAt ?? null,
        unreadCount,
        isPinned: pinnedByFriendId.has(friend.id),
        pinOrder: pinnedByFriendId.get(friend.id) ?? null,
        isTyping: typingFriendIds.has(friend.id),
      };
    }),
  );

  return summaries.sort((a, b) => (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0));
}

export async function getTotalUnreadMessageCount(userId: string): Promise<number> {
  return prisma.message.count({ where: { recipientId: userId, readAt: null } });
}

export async function getConversationMessages(userId: string, friendId: string, limit = 100) {
  if (!(await canConverse(userId, friendId))) throw new SocialError("Not friends with this user.");

  return prisma.message.findMany({
    where: {
      OR: [
        { senderId: userId, recipientId: friendId },
        { senderId: friendId, recipientId: userId },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

export async function markConversationRead(userId: string, friendId: string): Promise<void> {
  await prisma.message.updateMany({
    where: { senderId: friendId, recipientId: userId, readAt: null },
    data: { readAt: new Date() },
  });
}

/** Toggles pin state for a friend on the caller's own sidebar — not mutual. */
export async function togglePin(userId: string, friendId: string): Promise<{ isPinned: boolean }> {
  if (!(await canConverse(userId, friendId))) throw new SocialError("Not friends with this user.");

  const existing = await prisma.pinnedConversation.findUnique({
    where: { userId_friendId: { userId, friendId } },
  });

  if (existing) {
    await prisma.pinnedConversation.delete({ where: { id: existing.id } });
    return { isPinned: false };
  }

  const highest = await prisma.pinnedConversation.aggregate({ where: { userId }, _max: { pinOrder: true } });
  await prisma.pinnedConversation.create({
    data: { userId, friendId, pinOrder: (highest._max.pinOrder ?? 0) + 1 },
  });
  return { isPinned: true };
}

/** Upserted on a debounced keystroke in the composer; recency is the signal, not a boolean. */
export async function setTyping(senderId: string, recipientId: string): Promise<void> {
  if (!(await canConverse(senderId, recipientId))) return;
  await prisma.typingStatus.upsert({
    where: { senderId_recipientId: { senderId, recipientId } },
    update: {},
    create: { senderId, recipientId },
  });
}

export interface MessageableUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

/**
 * Powers the admin messaging center's "start a new conversation" search —
 * deliberately by name/email, not username, since a user doesn't need one
 * to be messaged this way (username is only required for the peer friend
 * system). Excludes the searching admin themself.
 */
export async function searchUsersForMessaging(query: string, excludeUserId: string): Promise<MessageableUser[]> {
  const trimmed = query.trim();
  const users = await prisma.user.findMany({
    where: {
      id: { not: excludeUserId },
      ...(trimmed
        ? { OR: [{ email: { contains: trimmed, mode: "insensitive" } }, { name: { contains: trimmed, mode: "insensitive" } }] }
        : {}),
    },
    select: { id: true, name: true, email: true, image: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return users;
}

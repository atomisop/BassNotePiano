import { getBoolSetting, getNumberSetting } from "@/lib/siteSettings";
import { prisma } from "@/lib/prisma";
import { createNotification, sendEmailIfEnabled } from "@/lib/notifications";
import { getEmployeeRecipients, isOwnerEmail } from "@/lib/adminNotifications";
import { getAppUrl } from "@/lib/email";
import { isFriend, getFriendsList, SocialError } from "@/lib/social";
import { assertRateLimit } from "@/lib/rateLimit";
import { isValidReaction } from "@/lib/reactions";

// Longest message and the other messaging limits are admin settings (Settings → Messaging).

// A typing row older than this is treated as stale rather than actively
// typing, there's no explicit "stopped typing" write, so recency is the
// only signal. Comfortably longer than the 2.5s active-thread poll interval
// so a normal typing cadence never flickers off between polls.
const TYPING_STALE_MS = 8_000;

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
 * anyone, no friend request needed, this is what makes the admin
 * messaging center work, and lets the recipient reply from their normal
 * Messages inbox. Still respects blocks either way (see isBlockedEitherWay
 * at each call site), being an admin doesn't override a user's own choice
 * to block that account.
 */
async function canConverse(userIdA: string, userIdB: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    prisma.user.findUnique({ where: { id: userIdA }, select: { role: true } }),
    prisma.user.findUnique({ where: { id: userIdB }, select: { role: true } }),
  ]);
  if (a?.role === "ADMIN" || b?.role === "ADMIN") return true;
  if (!(await getBoolSetting("messaging.enabled"))) throw new SocialError("Messaging between students is turned off right now.");
  return isFriend(userIdA, userIdB);
}

// 1-on-1 messaging is restricted to friends, unless either party is an
// admin, in which case it's always allowed (the admin messaging center
// needs to reach anyone, not just friends). Also gives this a natural
// spam/safety boundary without a separate moderation layer.
//
// `replyToId`, when given, is re-verified against this exact conversation
// (not just "some message that exists"), never trusted from the client as
// a bare id. A reply's own preview shows a snippet of the original message
// it points at, so accepting an id from a different conversation entirely
// would leak that message's content into a thread neither of its own
// participants is part of.
export async function sendMessage(senderId: string, recipientId: string, body: string, replyToId?: string) {
  const trimmed = body.trim();
  if (!trimmed) throw new SocialError("Message can't be empty.");
  const maxLength = await getNumberSetting("messaging.maxLength");
  if (trimmed.length > maxLength) throw new SocialError(`Message is too long (${maxLength} characters max).`);
  if (senderId === recipientId) throw new SocialError("You can't message yourself.");

  if (!(await canConverse(senderId, recipientId))) throw new SocialError("You can only message friends.");
  if (await isBlockedEitherWay(senderId, recipientId)) throw new SocialError("You can't message this user.");

  if (replyToId) {
    const original = await prisma.message.findUnique({ where: { id: replyToId }, select: { senderId: true, recipientId: true } });
    const inThisConversation =
      original && ((original.senderId === senderId && original.recipientId === recipientId) ||
        (original.senderId === recipientId && original.recipientId === senderId));
    if (!inThisConversation) throw new SocialError("That message can't be replied to here.");
  }

  // STEP 20: 30/minute is well above any real conversation's pace but stops
  // a compromised or scripted account from flooding a recipient's inbox.
  await assertRateLimit(
    prisma.message.count,
    { senderId },
    { windowMinutes: 1, max: 30, message: "You're sending messages too fast. Please slow down." },
  );

  const message = await prisma.message.create({ data: { senderId, recipientId, body: trimmed, replyToId: replyToId ?? null } });

  // A message landing is a much stronger signal than "typing", clear it
  // immediately rather than waiting out TYPING_STALE_MS.
  await prisma.typingStatus.deleteMany({ where: { senderId, recipientId } });

  // No in-app Notification row here on purpose, messages already have
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

  // Optional heads-up for employees (the owner decides) that someone wrote to
  // the owner account. Names the sender and a short preview only.
  const recipient = await prisma.user.findUnique({ where: { id: recipientId }, select: { email: true } });
  if (isOwnerEmail(recipient?.email)) {
    const employees = await getEmployeeRecipients("OWNER_MESSAGES");
    await Promise.all(
      employees.map((employee) =>
        createNotification({
          userId: employee.id,
          type: "ADMIN_ALERT",
          title: "New message to the owner",
          body: `${sender?.name ?? (sender?.username ? `@${sender.username}` : "Someone")}: "${trimmed.slice(0, 120)}"`,
          emailCategory: "social",
        }).catch((err) => console.error("Owner message alert failed (non-blocking):", err)),
      ),
    );
  }

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
 * caller this is "everyone they've ever exchanged a message with", the
 * admin messaging center's own inbox, since the admin typically has no
 * friends of their own. For a regular user it's "any admin who has
 * messaged them," so that conversation shows up in their normal Messages
 * inbox even without a friend request. Derived from actual Message rows
 * rather than a stored relation, there's no other durable record of an
 * admin-initiated thread.
 */
// STEP 19: this used to be `findMany` with no `take` at all, for an admin
// account with years of message history, every single message they've ever
// sent or received got pulled into memory just to derive a distinct list of
// partner IDs. 2000 most-recent messages is a generous bound for "who has
// this account talked to" in a studio this size; a partner whose only
// contact was further back than that would simply not resurface here, which
// is an acceptable trade for not scanning an unbounded table on every load.
const ADMIN_THREAD_SCAN_LIMIT = 2000;

async function getAdminThreadPartners(userId: string): Promise<ConversationPartner[]> {
  const self = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });

  const rows = await prisma.message.findMany({
    where: { OR: [{ senderId: userId }, { recipientId: userId }] },
    orderBy: { createdAt: "desc" },
    take: ADMIN_THREAD_SCAN_LIMIT,
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

/** One row per friend (plus any admin-bypassed thread), newest activity first, the conversation list view. */
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

  // STEP 19: this used to fire 2 queries PER partner (a findFirst for their
  // last message, a count for unread) inside the map below, a genuine N+1,
  // 2N round trips for a conversation list of N friends. Replaced with
  // exactly 2 queries total, independent of how many partners there are:
  // one findMany covering every partner's messages at once (capped, same
  // reasoning as ADMIN_THREAD_SCAN_LIMIT above, recent activity is what a
  // conversation list needs), reduced to "first occurrence per partner" in
  // memory since it's already ordered newest-first; and one groupBy that
  // does the unread counting DB-side instead of one COUNT per partner.
  const partnerIds = partners.map((p) => p.id);
  const [recentMessages, unreadGroups] = partnerIds.length
    ? await Promise.all([
        prisma.message.findMany({
          where: {
            OR: [
              { senderId: userId, recipientId: { in: partnerIds } },
              { senderId: { in: partnerIds }, recipientId: userId },
            ],
          },
          orderBy: { createdAt: "desc" },
          take: 2000,
        }),
        prisma.message.groupBy({
          by: ["senderId"],
          where: { senderId: { in: partnerIds }, recipientId: userId, readAt: null },
          _count: { _all: true },
        }),
      ])
    : [[], []];

  const lastMessageByPartner = new Map<string, (typeof recentMessages)[number]>();
  for (const m of recentMessages) {
    const partnerId = m.senderId === userId ? m.recipientId : m.senderId;
    if (!lastMessageByPartner.has(partnerId)) lastMessageByPartner.set(partnerId, m);
  }
  const unreadByPartner = new Map(unreadGroups.map((g) => [g.senderId, g._count._all]));

  const summaries: ConversationSummary[] = partners.map((friend) => {
    const lastMessage = lastMessageByPartner.get(friend.id);
    return {
      friendId: friend.id,
      friendUsername: friend.username,
      friendName: friend.name,
      friendImage: friend.image,
      lastMessageBody: lastMessage?.body ?? null,
      lastMessageAt: lastMessage?.createdAt ?? null,
      unreadCount: unreadByPartner.get(friend.id) ?? 0,
      isPinned: pinnedByFriendId.has(friend.id),
      pinOrder: pinnedByFriendId.get(friend.id) ?? null,
      isTyping: typingFriendIds.has(friend.id),
    };
  });

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
    // replyTo: just enough for the quoted-preview UI, never the full row
    // (the sender's own id/body is all a preview needs, no readAt etc).
    // reactions: every reaction on this message, however many people left
    // one, small numbers in practice (a 1:1 thread), not worth paginating.
    include: {
      replyTo: { select: { id: true, senderId: true, body: true } },
      reactions: { select: { userId: true, emoji: true } },
    },
  });
}

/**
 * Add, change, or remove (by re-picking the same emoji) this user's own
 * reaction to a message: one per person per message, same as iMessage's
 * own Tapback. `messageId` is checked against this user's own actual
 * conversations first: without that, any signed-in user could react to (and
 * thereby confirm the existence of, and attach their own visible reaction
 * to) an arbitrary message id from a conversation they have no part in.
 *
 * Also checks isBlockedEitherWay, same as sendMessage: reacting is a new,
 * active, visible-to-the-other-party interaction, not a passive read of
 * history (getConversationMessages doesn't check blocks, since old
 * conversations stay viewable after a block, only sending new ones is
 * disabled). Without this a block wouldn't actually stop either party from
 * still reaching the other through the thread's own old messages.
 */
export async function reactToMessage(userId: string, messageId: string, emoji: string): Promise<{ removed: boolean }> {
  if (!(await getBoolSetting("messaging.reactionsEnabled"))) throw new SocialError("Reactions are turned off right now.");
  if (!isValidReaction(emoji)) {
    throw new SocialError("Not a real reaction.");
  }

  const message = await prisma.message.findUnique({ where: { id: messageId }, select: { senderId: true, recipientId: true } });
  if (!message || (message.senderId !== userId && message.recipientId !== userId)) {
    throw new SocialError("You can't react to that message.");
  }

  const otherPartyId = message.senderId === userId ? message.recipientId : message.senderId;
  if (await isBlockedEitherWay(userId, otherPartyId)) throw new SocialError("You can't react to this conversation.");

  const existing = await prisma.messageReaction.findUnique({ where: { messageId_userId: { messageId, userId } } });
  if (existing?.emoji === emoji) {
    await prisma.messageReaction.delete({ where: { id: existing.id } });
    return { removed: true };
  }

  await prisma.messageReaction.upsert({
    where: { messageId_userId: { messageId, userId } },
    create: { messageId, userId, emoji },
    update: { emoji },
  });
  return { removed: false };
}

export async function markConversationRead(userId: string, friendId: string): Promise<void> {
  await prisma.message.updateMany({
    where: { senderId: friendId, recipientId: userId, readAt: null },
    data: { readAt: new Date() },
  });
}

/** Toggles pin state for a friend on the caller's own sidebar, not mutual. */
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
export async function setTyping(senderId: string, recipientId: string, typing = true): Promise<void> {
  if (!typing) {
    // The composer closed or lost focus: stop showing it straight away.
    await prisma.typingStatus.deleteMany({ where: { senderId, recipientId } });
    return;
  }
  if (!(await canConverse(senderId, recipientId))) return;
  await prisma.typingStatus.upsert({
    where: { senderId_recipientId: { senderId, recipientId } },
    // Explicit: an empty update does not touch the @updatedAt column, and recency is the whole signal here.
    update: { updatedAt: new Date() },
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
 * Powers the admin messaging center's "start a new conversation" search,
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

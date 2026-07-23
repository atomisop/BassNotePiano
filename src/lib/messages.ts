import { prisma } from "@/lib/prisma";
import { sendEmailIfEnabled } from "@/lib/notifications";
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

// 1-on-1 messaging is restricted to friends, same as the spec groups it
// under the friends system — also gives this a natural spam/safety
// boundary without a separate moderation layer.
export async function sendMessage(senderId: string, recipientId: string, body: string) {
  const trimmed = body.trim();
  if (!trimmed) throw new SocialError("Message can't be empty.");
  if (trimmed.length > MAX_MESSAGE_LENGTH) throw new SocialError(`Message is too long (${MAX_MESSAGE_LENGTH} characters max).`);
  if (senderId === recipientId) throw new SocialError("You can't message yourself.");

  if (!(await isFriend(senderId, recipientId))) throw new SocialError("You can only message friends.");
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

/** One row per friend, newest activity first — the conversation list view. */
export async function getConversations(userId: string): Promise<ConversationSummary[]> {
  const [friends, pinnedRows, typingRows] = await Promise.all([
    getFriendsList(userId),
    prisma.pinnedConversation.findMany({ where: { userId }, select: { friendId: true, pinOrder: true } }),
    prisma.typingStatus.findMany({
      where: { recipientId: userId, updatedAt: { gte: new Date(Date.now() - TYPING_STALE_MS) } },
      select: { senderId: true },
    }),
  ]);

  const pinnedByFriendId = new Map(pinnedRows.map((p) => [p.friendId, p.pinOrder]));
  const typingFriendIds = new Set(typingRows.map((t) => t.senderId));

  const summaries = await Promise.all(
    friends.map(async (friend): Promise<ConversationSummary> => {
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
  if (!(await isFriend(userId, friendId))) throw new SocialError("Not friends with this user.");

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
  if (!(await isFriend(userId, friendId))) throw new SocialError("Not friends with this user.");

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
  if (!(await isFriend(senderId, recipientId))) return;
  await prisma.typingStatus.upsert({
    where: { senderId_recipientId: { senderId, recipientId } },
    update: {},
    create: { senderId, recipientId },
  });
}

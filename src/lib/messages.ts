import { prisma } from "@/lib/prisma";
import { sendEmailIfEnabled } from "@/lib/notifications";
import { isFriend, getFriendsList, SocialError } from "@/lib/social";

const MAX_MESSAGE_LENGTH = 2000;

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
}

/** One row per friend, newest activity first — the conversation list view. */
export async function getConversations(userId: string): Promise<ConversationSummary[]> {
  const friends = await getFriendsList(userId);

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

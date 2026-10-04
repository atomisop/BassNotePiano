import { prisma } from "@/lib/prisma";
import { sendEmailIfEnabled } from "@/lib/notifications";
import { getAppUrl } from "@/lib/email";
import { isFriend, normalizeUsername, SocialError } from "@/lib/social";
import { assertRateLimit } from "@/lib/rateLimit";
import { isValidReaction } from "@/lib/reactions";

const MAX_MESSAGE_LENGTH = 2000;
// Creator + up to 23 friends — generous headroom over a normal friend-group
// size while keeping the member-list UI and per-message email fanout sane.
const MAX_GROUP_MEMBERS = 24;

export interface CreateGroupInput {
  creatorId: string;
  name?: string;
  memberUsernames: string[];
}

// Membership is friends-only at creation time (same trust boundary as 1-on-1
// messaging) and fixed after that — there's no post-creation invite/kick,
// only leaving, which keeps the moderation surface small for a first version.
export async function createGroup({ creatorId, name, memberUsernames }: CreateGroupInput) {
  const usernames = Array.from(new Set(memberUsernames.map(normalizeUsername))).filter(Boolean);
  if (usernames.length === 0) throw new SocialError("Add at least one friend to the group.");
  if (usernames.length > MAX_GROUP_MEMBERS - 1) throw new SocialError(`Groups are limited to ${MAX_GROUP_MEMBERS} members.`);

  const found = await prisma.user.findMany({ where: { username: { in: usernames } }, select: { id: true, username: true } });
  const foundUsernames = new Set(found.map((u) => u.username));
  const missing = usernames.filter((u) => !foundUsernames.has(u));
  if (missing.length > 0) throw new SocialError(`No user found for: ${missing.map((u) => `@${u}`).join(", ")}`);

  const members = found.filter((u) => u.id !== creatorId);
  if (members.length === 0) throw new SocialError("Add at least one friend to the group.");

  // STEP 20: creating a group is rare for genuine use — 10/hour is
  // generous headroom while blocking scripted mass-group creation.
  await assertRateLimit(
    prisma.groupConversation.count,
    { createdById: creatorId },
    { windowMinutes: 60, max: 10, message: "You're creating groups too fast — please wait a bit and try again." },
  );

  for (const member of members) {
    if (!(await isFriend(creatorId, member.id))) {
      throw new SocialError(`@${member.username} isn't on your friends list.`);
    }
  }

  return prisma.groupConversation.create({
    data: {
      name: name?.trim() || null,
      createdById: creatorId,
      members: {
        create: [{ userId: creatorId, lastReadAt: new Date() }, ...members.map((m) => ({ userId: m.id }))],
      },
    },
  });
}

export interface GroupSummary {
  id: string;
  name: string | null;
  memberNames: string[];
  memberCount: number;
  lastMessageBody: string | null;
  lastMessageAt: Date | null;
  lastMessageSenderName: string | null;
  unreadCount: number;
}

/** One row per group the user belongs to, newest activity first. */
export async function getGroups(userId: string): Promise<GroupSummary[]> {
  const memberships = await prisma.groupMember.findMany({
    where: { userId },
    include: {
      conversation: {
        include: { members: { include: { user: { select: { id: true, name: true, username: true } } } } },
      },
    },
  });

  const summaries = await Promise.all(
    memberships.map(async (membership): Promise<GroupSummary> => {
      const { conversation } = membership;
      const [lastMessage, unreadCount] = await Promise.all([
        prisma.groupMessage.findFirst({
          where: { conversationId: conversation.id },
          orderBy: { createdAt: "desc" },
          include: { sender: { select: { name: true, username: true } } },
        }),
        prisma.groupMessage.count({
          where: {
            conversationId: conversation.id,
            senderId: { not: userId },
            createdAt: { gt: membership.lastReadAt ?? membership.joinedAt },
          },
        }),
      ]);

      return {
        id: conversation.id,
        name: conversation.name,
        memberNames: conversation.members
          .filter((m) => m.userId !== userId)
          .map((m) => m.user.name ?? (m.user.username ? `@${m.user.username}` : "Someone")),
        memberCount: conversation.members.length,
        lastMessageBody: lastMessage?.body ?? null,
        lastMessageAt: lastMessage?.createdAt ?? conversation.createdAt,
        lastMessageSenderName: lastMessage ? (lastMessage.sender.name ?? lastMessage.sender.username) : null,
        unreadCount,
      };
    }),
  );

  return summaries.sort((a, b) => (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0));
}

export async function getTotalUnreadGroupMessageCount(userId: string): Promise<number> {
  const memberships = await prisma.groupMember.findMany({ where: { userId }, select: { conversationId: true, lastReadAt: true, joinedAt: true } });
  const counts = await Promise.all(
    memberships.map((m) =>
      prisma.groupMessage.count({
        where: { conversationId: m.conversationId, senderId: { not: userId }, createdAt: { gt: m.lastReadAt ?? m.joinedAt } },
      }),
    ),
  );
  return counts.reduce((sum, c) => sum + c, 0);
}

async function requireMembership(userId: string, groupId: string) {
  const membership = await prisma.groupMember.findUnique({ where: { conversationId_userId: { conversationId: groupId, userId } } });
  if (!membership) throw new SocialError("You're not a member of this group.");
  return membership;
}

export async function getGroupDetail(userId: string, groupId: string) {
  await requireMembership(userId, groupId);
  return prisma.groupConversation.findUniqueOrThrow({
    where: { id: groupId },
    include: { members: { include: { user: { select: { id: true, name: true, username: true, image: true } } } } },
  });
}

export async function getGroupMessages(userId: string, groupId: string, limit = 100) {
  await requireMembership(userId, groupId);
  return prisma.groupMessage.findMany({
    where: { conversationId: groupId },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: {
      sender: { select: { id: true, name: true, username: true, image: true } },
      replyTo: { select: { id: true, senderId: true, body: true, sender: { select: { name: true, username: true } } } },
      reactions: { select: { userId: true, emoji: true } },
    },
  });
}

/**
 * Same shape as 1-on-1 sendMessage's own replyToId handling: re-verified
 * against this exact group (not just "some message that exists somewhere")
 * before it's trusted, same reasoning as that comment.
 */
export async function sendGroupMessage(senderId: string, groupId: string, body: string, replyToId?: string) {
  const trimmed = body.trim();
  if (!trimmed) throw new SocialError("Message can't be empty.");
  if (trimmed.length > MAX_MESSAGE_LENGTH) throw new SocialError(`Message is too long (${MAX_MESSAGE_LENGTH} characters max).`);

  const membership = await requireMembership(senderId, groupId);

  if (replyToId) {
    const original = await prisma.groupMessage.findUnique({ where: { id: replyToId }, select: { conversationId: true } });
    if (original?.conversationId !== groupId) throw new SocialError("That message can't be replied to here.");
  }

  // STEP 20: same reasoning/limit as 1-on-1 sendMessage.
  await assertRateLimit(
    prisma.groupMessage.count,
    { senderId },
    { windowMinutes: 1, max: 30, message: "You're sending messages too fast — please slow down." },
  );

  const [message] = await prisma.$transaction([
    prisma.groupMessage.create({ data: { conversationId: groupId, senderId, body: trimmed, replyToId: replyToId ?? null } }),
    prisma.groupMember.update({ where: { id: membership.id }, data: { lastReadAt: new Date() } }),
  ]);

  // Same pattern as 1-on-1 messages: no in-app Notification row (the
  // Messages nav badge + group list are the unread surface), email-only for
  // members who aren't actively on the site.
  const [sender, otherMembers] = await Promise.all([
    prisma.user.findUnique({ where: { id: senderId }, select: { name: true, username: true } }),
    prisma.groupMember.findMany({ where: { conversationId: groupId, userId: { not: senderId } }, select: { userId: true } }),
  ]);
  await Promise.all(
    otherMembers.map((m) =>
      sendEmailIfEnabled(
        m.userId,
        "social",
        "New group message",
        `${sender?.name ?? (sender?.username ? `@${sender.username}` : "Someone")} sent a message in your group chat.`,
        { label: "Click here to reply", url: getAppUrl(`/messages?group=${groupId}`) },
      ),
    ),
  );

  return message;
}

/** Same shape as 1-on-1 messages' own reactToMessage, see its comment. */
export async function reactToGroupMessage(userId: string, messageId: string, emoji: string): Promise<{ removed: boolean }> {
  if (!isValidReaction(emoji)) {
    throw new SocialError("Not a real reaction.");
  }

  const message = await prisma.groupMessage.findUnique({ where: { id: messageId }, select: { conversationId: true } });
  if (!message) throw new SocialError("You can't react to that message.");
  await requireMembership(userId, message.conversationId);

  const existing = await prisma.groupMessageReaction.findUnique({ where: { messageId_userId: { messageId, userId } } });
  if (existing?.emoji === emoji) {
    await prisma.groupMessageReaction.delete({ where: { id: existing.id } });
    return { removed: true };
  }

  await prisma.groupMessageReaction.upsert({
    where: { messageId_userId: { messageId, userId } },
    create: { messageId, userId, emoji },
    update: { emoji },
  });
  return { removed: false };
}

/**
 * When each OTHER member last opened this group, straight from the database.
 * A message counts as seen by a member once their lastReadAt (stamped only
 * while the chat is actually open and visible, see markGroupRead) is at or
 * after it was sent.
 */
export async function getGroupReadReceipts(userId: string, groupId: string): Promise<{ lastReadAt: Date | null }[]> {
  await requireMembership(userId, groupId);
  return prisma.groupMember.findMany({
    where: { conversationId: groupId, userId: { not: userId } },
    select: { lastReadAt: true },
  });
}

export async function markGroupRead(userId: string, groupId: string): Promise<void> {
  const membership = await requireMembership(userId, groupId);
  await prisma.groupMember.update({ where: { id: membership.id }, data: { lastReadAt: new Date() } });
}

export async function leaveGroup(userId: string, groupId: string): Promise<void> {
  const membership = await requireMembership(userId, groupId);
  await prisma.groupMember.delete({ where: { id: membership.id } });

  const remaining = await prisma.groupMember.count({ where: { conversationId: groupId } });
  if (remaining === 0) {
    await prisma.groupConversation.delete({ where: { id: groupId } });
  }
}

import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { checkSocialBadges } from "@/lib/gamification";

export class SocialError extends Error {}

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@/, "");
}

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

export async function setUsername(userId: string, rawUsername: string) {
  const username = normalizeUsername(rawUsername);
  if (!isValidUsername(username)) {
    throw new SocialError("Usernames are 3-20 characters: lowercase letters, numbers, and underscores only.");
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing && existing.id !== userId) {
    throw new SocialError("That username is already taken.");
  }

  return prisma.user.update({ where: { id: userId }, data: { username } });
}

const publicProfileSelect = { id: true, username: true, name: true, image: true } as const;

export async function searchUsersByUsername(query: string, currentUserId: string) {
  const normalized = normalizeUsername(query);
  if (normalized.length < 2) return [];

  const [blockedByMe, blockingMe] = await Promise.all([
    prisma.block.findMany({ where: { blockerId: currentUserId }, select: { blockedId: true } }),
    prisma.block.findMany({ where: { blockedId: currentUserId }, select: { blockerId: true } }),
  ]);
  const excludeIds = [currentUserId, ...blockedByMe.map((b) => b.blockedId), ...blockingMe.map((b) => b.blockerId)];

  return prisma.user.findMany({
    where: { username: { contains: normalized, not: null }, id: { notIn: excludeIds } },
    select: publicProfileSelect,
    take: 10,
  });
}

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

async function acceptFriendRequestById(requestId: string) {
  const request = await prisma.friendRequest.update({
    where: { id: requestId },
    data: { status: "ACCEPTED", respondedAt: new Date() },
  });

  await createNotification({
    userId: request.senderId,
    type: "FRIEND_REQUEST_ACCEPTED",
    title: "Friend request accepted",
    body: "Your friend request was accepted — you can now message each other.",
    emailCategory: "social",
  });

  await Promise.all([
    checkSocialBadges(request.senderId).catch((err) => console.error("Social badge check failed:", err)),
    checkSocialBadges(request.receiverId).catch((err) => console.error("Social badge check failed:", err)),
  ]);

  return request;
}

export async function sendFriendRequest(senderId: string, receiverUsername: string) {
  const receiver = await prisma.user.findUnique({ where: { username: normalizeUsername(receiverUsername) } });
  if (!receiver) throw new SocialError("No user found with that username.");
  if (receiver.id === senderId) throw new SocialError("You can't add yourself.");

  if (await isBlockedEitherWay(senderId, receiver.id)) {
    throw new SocialError("You can't send a request to this user.");
  }

  // They already sent us a pending request — accept theirs instead of creating a mirrored duplicate.
  const reverse = await prisma.friendRequest.findUnique({
    where: { senderId_receiverId: { senderId: receiver.id, receiverId: senderId } },
  });
  if (reverse?.status === "ACCEPTED") throw new SocialError("You're already friends.");
  if (reverse?.status === "PENDING") return acceptFriendRequestById(reverse.id);

  const sender = await prisma.user.findUniqueOrThrow({ where: { id: senderId }, select: { name: true, username: true } });

  const request = await prisma.friendRequest.upsert({
    where: { senderId_receiverId: { senderId, receiverId: receiver.id } },
    update: { status: "PENDING", respondedAt: null, createdAt: new Date() },
    create: { senderId, receiverId: receiver.id, status: "PENDING" },
  });

  await createNotification({
    userId: receiver.id,
    type: "FRIEND_REQUEST_RECEIVED",
    title: "New friend request",
    body: `@${sender.username ?? "someone"} (${sender.name ?? "unnamed"}) wants to be friends.`,
    emailCategory: "social",
  });

  return request;
}

export async function respondToFriendRequest(userId: string, requestId: string, accept: boolean) {
  const request = await prisma.friendRequest.findUniqueOrThrow({ where: { id: requestId } });
  if (request.receiverId !== userId) throw new SocialError("Not your request to respond to.");
  if (request.status !== "PENDING") throw new SocialError("This request has already been handled.");

  if (accept) return acceptFriendRequestById(requestId);
  return prisma.friendRequest.update({ where: { id: requestId }, data: { status: "REJECTED", respondedAt: new Date() } });
}

export async function blockUser(blockerId: string, blockedId: string) {
  if (blockerId === blockedId) throw new SocialError("You can't block yourself.");

  await prisma.$transaction([
    prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      update: {},
      create: { blockerId, blockedId },
    }),
    prisma.friendRequest.updateMany({
      where: {
        status: { in: ["PENDING", "ACCEPTED"] },
        OR: [
          { senderId: blockerId, receiverId: blockedId },
          { senderId: blockedId, receiverId: blockerId },
        ],
      },
      data: { status: "REJECTED", respondedAt: new Date() },
    }),
  ]);
}

export async function unblockUser(blockerId: string, blockedId: string) {
  await prisma.block.deleteMany({ where: { blockerId, blockedId } });
}

export async function isFriend(userIdA: string, userIdB: string): Promise<boolean> {
  const request = await prisma.friendRequest.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        { senderId: userIdA, receiverId: userIdB },
        { senderId: userIdB, receiverId: userIdA },
      ],
    },
  });
  return Boolean(request);
}

export async function getFriendsList(userId: string) {
  const accepted = await prisma.friendRequest.findMany({
    where: { status: "ACCEPTED", OR: [{ senderId: userId }, { receiverId: userId }] },
    include: { sender: { select: publicProfileSelect }, receiver: { select: publicProfileSelect } },
  });
  return accepted.map((r) => (r.senderId === userId ? r.receiver : r.sender));
}

export async function getPendingRequestsReceived(userId: string) {
  return prisma.friendRequest.findMany({
    where: { receiverId: userId, status: "PENDING" },
    include: { sender: { select: publicProfileSelect } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPendingRequestsSent(userId: string) {
  return prisma.friendRequest.findMany({
    where: { senderId: userId, status: "PENDING" },
    include: { receiver: { select: publicProfileSelect } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getBlockedUsers(userId: string) {
  return prisma.block.findMany({
    where: { blockerId: userId },
    include: { blocked: { select: publicProfileSelect } },
    orderBy: { createdAt: "desc" },
  });
}

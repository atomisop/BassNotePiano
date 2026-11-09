import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { checkSocialBadges } from "@/lib/gamification";
import { assertRateLimit, consumeRateLimit, RateLimitError } from "@/lib/rateLimit";
import { answerHref } from "@/lib/bellAnswers";
import { looksLikeEmail } from "@/lib/familyMemberCheck";
import { sendRegisterInvite } from "@/lib/registerInvite";

export class SocialError extends Error {}

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@/, "");
}

/** Names that would let a student pass for the studio, the teacher or the assistant in friend lists, messages and the leaderboard. */
const RESERVED_USERNAME_PARTS = ["admin", "owner", "teacher", "support", "staff", "moderator", "official", "bassnote", "bnp", "atom", "system", "root"];

export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAME_PARTS.some((part) => username.includes(part));
}

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

export async function setUsername(userId: string, rawUsername: string) {
  const username = normalizeUsername(rawUsername);
  if (!isValidUsername(username)) {
    throw new SocialError("Usernames are 3-20 characters: lowercase letters, numbers, and underscores only.");
  }

  if (isReservedUsername(username)) throw new SocialError("That username isn't available.");

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing && existing.id !== userId) {
    throw new SocialError("That username is already taken.");
  }

  try {
    return await prisma.user.update({ where: { id: userId }, data: { username } });
  } catch (err) {
    // Two people claiming the same name at the same moment: the unique index lets one win.
    if ((err as { code?: string })?.code === "P2002") throw new SocialError("That username is already taken.");
    throw err;
  }
}

const publicProfileSelect = { id: true, username: true, name: true, image: true } as const;

export async function searchUsersByUsername(query: string, currentUserId: string) {
  const normalized = normalizeUsername(query);
  if (normalized.length < 3) return [];
  // Search is a way to list who has an account, so it is limited per person.
  await consumeRateLimit(prisma, `friend-search:${currentUserId}`, { windowMinutes: 10, max: 30, message: "Too many searches. Please wait a few minutes." });

  const [blockedByMe, blockingMe] = await Promise.all([
    prisma.block.findMany({ where: { blockerId: currentUserId }, select: { blockedId: true } }),
    prisma.block.findMany({ where: { blockedId: currentUserId }, select: { blockerId: true } }),
  ]);
  const excludeIds = [currentUserId, ...blockedByMe.map((b) => b.blockedId), ...blockingMe.map((b) => b.blockerId)];

  return prisma.user.findMany({
    where: { username: { contains: normalized, not: null }, id: { notIn: excludeIds }, bannedAt: null, role: { not: "ADMIN" } },
    select: publicProfileSelect,
    take: 10,
  });
}

export async function isBlockedEitherWay(userIdA: string, userIdB: string): Promise<boolean> {
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
    body: "Your friend request was accepted. You can now see each other's profile and nudge each other to practice.",
    emailCategory: "social",
  });

  await Promise.all([
    checkSocialBadges(request.senderId).catch((err) => console.error("Social badge check failed:", err)),
    checkSocialBadges(request.receiverId).catch((err) => console.error("Social badge check failed:", err)),
  ]);

  return request;
}

export async function sendFriendRequest(senderId: string, receiverUsername: string) {
  // Looking a name up answers "does this person exist", so the lookup itself is limited, before it happens.
  await consumeRateLimit(prisma, `friend-lookup:${senderId}`, { windowMinutes: 60, max: 40, message: "You're sending friend requests too fast. Please wait a bit and try again." });
  const receiver = await prisma.user.findUnique({ where: { username: normalizeUsername(receiverUsername) } });
  if (!receiver) throw new SocialError("No user found with that username.");
  if (receiver.id === senderId) throw new SocialError("You can't add yourself.");
  return requestFriendship(senderId, receiver.id, "username");
}

/**
 * The one place a friend request is made, whether the person was found by username (Friends) or by email (asking to book a class
 * together). Blocks, the hourly cap and "they already asked you" work the same both ways. The notice carries the request, so the bell
 * shows Accept and Decline on it.
 */
async function requestFriendship(senderId: string, receiverId: string, via: "username" | "booking") {
  if (await isBlockedEitherWay(senderId, receiverId)) {
    throw new SocialError("You can't send a request to this user.");
  }

  // STEP 20: 20/hour is generous for genuine friend-adding while blocking
  // mass friend-request spam across many accounts.
  await assertRateLimit(
    prisma.friendRequest.count,
    { senderId },
    { windowMinutes: 60, max: 20, message: "You're sending friend requests too fast. Please wait a bit and try again." },
  );

  // They already sent us a pending request, accept theirs instead of creating a mirrored duplicate.
  const reverse = await prisma.friendRequest.findUnique({
    where: { senderId_receiverId: { senderId: receiverId, receiverId: senderId } },
  });
  if (reverse?.status === "ACCEPTED") throw new SocialError("You're already friends.");
  if (reverse?.status === "PENDING") return acceptFriendRequestById(reverse.id);

  const sender = await prisma.user.findUniqueOrThrow({ where: { id: senderId }, select: { name: true, username: true } });

  const request = await prisma.friendRequest.upsert({
    where: { senderId_receiverId: { senderId, receiverId } },
    update: { status: "PENDING", respondedAt: null, createdAt: new Date() },
    create: { senderId, receiverId, status: "PENDING" },
  });

  const who = sender.username ? `@${sender.username} (${sender.name ?? "unnamed"})` : (sender.name ?? "Someone");
  await createNotification({
    userId: receiverId,
    type: "FRIEND_REQUEST_RECEIVED",
    title: "New friend request",
    body: via === "booking" ? `${who} wants to be friends so you can book classes together.` : `${who} wants to be friends.`,
    emailCategory: "social",
    href: answerHref("/friends#requests", request.id),
  });

  return request;
}

/** Said for every "ask to book together", whatever happened behind it, so the answer never tells whether an email has an account. */
export const ASK_TOGETHER_SENT = "Asked. Once they say yes, you can book together.";
const ASK_TOGETHER_LIMIT = "You have asked a lot of people today. Please try again tomorrow.";

/**
 * "Ask to book together" from the family class form: a friend request by email, since a class with someone needs a friendship first.
 * An account gets a friend request (answered in the bell); an email with no account gets the invitation to make one. Either way the
 * answer is the same, and it is limited before anything is looked up, so it cannot be used to find out who has an account.
 */
export async function askToBookTogether(senderId: string, rawEmail: string): Promise<"asked"> {
  const email = rawEmail.trim().toLowerCase();
  if (!looksLikeEmail(email) || email.length > 254) throw new SocialError("That does not look like an email.");
  await consumeRateLimit(prisma, `ask-together:${senderId}`, { windowMinutes: 24 * 60, max: 10, message: ASK_TOGETHER_LIMIT });
  const [sender, receiver] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: senderId }, select: { email: true } }),
    prisma.user.findUnique({ where: { email }, select: { id: true, role: true, bannedAt: true } }),
  ]);
  if (sender.email.toLowerCase() === email) throw new SocialError("That is your own email.");
  try {
    if (!receiver) {
      await sendRegisterInvite(senderId, email);
    } else if (receiver.role === "STUDENT" && !receiver.bannedAt) {
      const waiting = await prisma.friendRequest.findUnique({ where: { senderId_receiverId: { senderId, receiverId: receiver.id } }, select: { status: true } });
      // Already asked and not answered yet: they are not told twice.
      if (waiting?.status !== "PENDING") await requestFriendship(senderId, receiver.id, "booking");
    }
    // A banned or admin account is treated like any other address: nothing is sent, and the answer is the same.
  } catch (err) {
    // A block, "already friends" or an inner limit would each say something about the address, so all are folded into the same answer.
    if (err instanceof RateLimitError) throw new SocialError(ASK_TOGETHER_LIMIT);
    if (!(err instanceof SocialError)) throw err;
  }
  return "asked";
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

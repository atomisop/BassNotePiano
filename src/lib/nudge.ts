import { prisma } from "@/lib/prisma";
import { consumeRateLimit, RateLimitError } from "@/lib/rateLimit";
import { createNotification } from "@/lib/notifications";
import { getFingerPracticeStatus } from "@/lib/fingerPractice";
import { isBlockedEitherWay, isFriend, SocialError } from "@/lib/social";
import { NUDGES_PER_FRIEND_PER_DAY, NUDGES_PER_DAY_IN_ALL, nudgeBody, nudgeTitle } from "@/lib/nudgeRules";

/**
 * A friend taps "Nudge to practice" on another friend's profile. The only thing that is ever sent is fixed wording ("Your friend X is
 * reminding you to practice"): there is no text box, so it cannot be used to say anything else. It reaches the friend as a banner at the
 * top of the screen and a bell notice, never an email or a push.
 *
 * A nudge is refused (with one neutral message that does not say why, so it cannot reveal a friend's settings) when the two are not
 * accepted friends, either has blocked the other, either account is banned, the friend has switched off social notices (the switch friend requests use), or the friend
 * has already finished today's 10 minutes. At most two per friend per day, and a daily cap across all friends.
 */
const REFUSED = "You can't nudge this friend right now.";

export async function sendNudge(senderId: string, friendId: string): Promise<void> {
  if (senderId === friendId) throw new SocialError(REFUSED);

  const [sender, friend] = await Promise.all([
    prisma.user.findUnique({ where: { id: senderId }, select: { name: true, username: true, bannedAt: true } }),
    prisma.user.findUnique({ where: { id: friendId }, select: { bannedAt: true, notifyEmailSocial: true } }),
  ]);
  if (!sender || !friend || sender.bannedAt || friend.bannedAt) throw new SocialError(REFUSED);
  if (!friend.notifyEmailSocial) throw new SocialError(REFUSED);
  if (!(await isFriend(senderId, friendId)) || (await isBlockedEitherWay(senderId, friendId))) throw new SocialError(REFUSED);

  const practice = await getFingerPracticeStatus(friendId);
  if (practice.completedToday) throw new SocialError("They already finished today's practice.");

  try {
    await consumeRateLimit(prisma, `nudge:pair:${senderId}:${friendId}`, {
      windowMinutes: 24 * 60,
      max: NUDGES_PER_FRIEND_PER_DAY,
      message: "You already nudged this friend twice today.",
    });
    await consumeRateLimit(prisma, `nudge:all:${senderId}`, {
      windowMinutes: 24 * 60,
      max: NUDGES_PER_DAY_IN_ALL,
      message: "You have sent a lot of nudges today. Try again tomorrow.",
    });
  } catch (err) {
    if (err instanceof RateLimitError) throw new SocialError(err.message);
    throw err;
  }

  await createNotification({
    userId: friendId,
    type: "FRIEND_NUDGE",
    title: nudgeTitle(sender.name ?? sender.username),
    body: nudgeBody(),
    href: "/practice",
  });
}

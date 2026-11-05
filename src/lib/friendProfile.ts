import type { BadgeCode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getFingerPracticeStatus } from "@/lib/fingerPractice";
import { getDoneLast7ByUser } from "@/lib/practiceActivity";
import { isBlockedEitherWay, isFriend, normalizeUsername } from "@/lib/social";

export interface FriendProfile {
  id: string;
  name: string | null;
  username: string;
  image: string | null;
  streak: number;
  longest: number;
  practicedToday: boolean;
  doneLast7: number;
  badgeCodes: BadgeCode[];
}

/**
 * What one friend can see of another: name, photo, practice and badges, nothing else (never an email, phone, plan or payment).
 * Null unless the two are accepted friends and neither has blocked the other, so the page answers a stranger exactly like a missing
 * person (404).
 */
export async function getFriendProfile(viewerId: string, rawUsername: string): Promise<FriendProfile | null> {
  const user = await prisma.user.findUnique({
    where: { username: normalizeUsername(rawUsername) },
    select: { id: true, name: true, username: true, image: true, bannedAt: true },
  });
  if (!user || !user.username || user.bannedAt || user.id === viewerId) return null;
  if (!(await isFriend(viewerId, user.id)) || (await isBlockedEitherWay(viewerId, user.id))) return null;

  const [practice, doneLast7, badges] = await Promise.all([
    getFingerPracticeStatus(user.id),
    getDoneLast7ByUser([user.id]),
    prisma.userBadge.findMany({ where: { userId: user.id }, select: { code: true } }),
  ]);
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    image: user.image,
    streak: practice.streak,
    longest: practice.longest ?? 0,
    practicedToday: practice.completedToday,
    doneLast7: doneLast7.get(user.id) ?? 0,
    badgeCodes: badges.map((b) => b.code),
  };
}

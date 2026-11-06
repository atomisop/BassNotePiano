import type { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isCurrentSlotId } from "@/lib/bannerSlots";

export type BannerKind = "phone" | "discord" | "practice";

const TYPE: Record<BannerKind, NotificationType> = { phone: "BANNER_PHONE", discord: "BANNER_DISCORD", practice: "BANNER_PRACTICE" };
const TEXT: Record<BannerKind, { title: string; body: string }> = {
  phone: { title: "Add your phone number", body: "It helps us match your payments and reach you." },
  discord: { title: "Connect your Discord", body: "Your private class call opens there before each lesson." },
  practice: { title: "Time to practice", body: "Your 10 minutes of finger practice is not done today." },
};

export function isBannerKind(value: unknown): value is BannerKind {
  return value === "phone" || value === "discord" || value === "practice";
}

/**
 * Keeps the reminder a banner stands for in the person's notifications (grouped under Reminders), once per banner per slot, so closing the
 * banner never loses it. Only for a slot that is current right now, and never while the thing it asks for is already done.
 */
export async function recordBannerNotice(userId: string, kind: BannerKind, slotId: string, now = new Date()): Promise<"recorded" | "already" | "not-needed" | "bad-slot"> {
  if (!isCurrentSlotId(slotId, now)) return "bad-slot";
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { discordId: true, phone: true, role: true } });
  if (!user) return "bad-slot";
  if (kind === "discord" && user.discordId) return "not-needed";
  if (kind === "phone" && user.phone) return "not-needed";

  const type = TYPE[kind];
  const slotStart = new Date(slotId);
  // The window is the real slot length counted back from now, never the caller's own slot string, so a forged slot cannot slide it.
  const windowStart = new Date(Math.max(slotStart.getTime(), now.getTime() - 6 * 60 * 60 * 1000));
  const existing = await prisma.notification.findFirst({ where: { userId, type, createdAt: { gte: windowStart } }, select: { id: true } });
  if (existing) return "already";
  await prisma.notification.create({ data: { userId, type, title: TEXT[kind].title, body: TEXT[kind].body } });
  return "recorded";
}

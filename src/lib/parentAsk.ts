import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { consumeRateLimit } from "@/lib/rateLimit";
import { formatEtDateTime } from "@/lib/classScheduleLabels";
import { parentMoveHref } from "@/lib/bellAnswers";

/**
 * "Ask my parent to move or skip this": a child whose parent controls the schedule cannot move or cancel a class themselves (see
 * hasParentControl), so instead they tap this on the class and every linked parent gets a notice that opens that very class's move picker
 * on the child's page. Nothing about the class changes until the parent acts.
 */
export class ParentAskError extends Error {}

/** The same class is not asked about again within this long (the parent was already told). */
export const PARENT_ASK_REPEAT_HOURS = 12;
const HOUR_MS = 60 * 60 * 1000;

export interface ParentAskClass {
  id: string;
  scheduledAt: string;
  label: string | null;
  /** Already asked about in the last PARENT_ASK_REPEAT_HOURS. */
  asked: boolean;
}

const firstName = (u: { name: string | null; email: string }) => u.name?.trim().split(/\s+/)[0] || "Your child";

/** What the child sees on their locked Lessons screen: their parents' names and the classes coming up, each with whether it was asked about. */
export async function listClassesToAskAbout(childId: string): Promise<{ parentNames: string[]; classes: ParentAskClass[] }> {
  const parents = await prisma.parentLink.findMany({ where: { childId, status: "ACCEPTED" }, select: { parentId: true, parent: { select: { name: true, email: true } } } });
  if (parents.length === 0) return { parentNames: [], classes: [] };
  const bookings = await prisma.classBooking.findMany({
    where: { studentId: childId, status: "SCHEDULED", scheduledAt: { gt: new Date() } },
    orderBy: { scheduledAt: "asc" },
    take: 8,
    select: { id: true, scheduledAt: true, schedule: { select: { label: true } } },
  });
  const recent = await prisma.notification.findMany({
    where: {
      userId: { in: parents.map((p) => p.parentId) },
      type: "PARENT_CLASS_ASK",
      createdAt: { gt: new Date(Date.now() - PARENT_ASK_REPEAT_HOURS * HOUR_MS) },
      href: { in: bookings.map((b) => parentMoveHref(childId, b.id)) },
    },
    select: { href: true },
  });
  const askedHrefs = new Set(recent.map((n) => n.href));
  return {
    parentNames: parents.map((p) => p.parent.name ?? p.parent.email),
    classes: bookings.map((b) => ({ id: b.id, scheduledAt: b.scheduledAt.toISOString(), label: b.schedule.label, asked: askedHrefs.has(parentMoveHref(childId, b.id)) })),
  };
}

/**
 * Tells every linked parent the child would like this class moved or skipped. Only the child's own class still to come, only while a
 * parent is linked; the same class at most once per PARENT_ASK_REPEAT_HOURS (a repeat is a quiet no-op), and a few a day in all.
 */
export async function askParentAboutClass(childId: string, bookingId: string): Promise<"asked" | "already"> {
  const booking = await prisma.classBooking.findUnique({ where: { id: bookingId }, select: { studentId: true, status: true, scheduledAt: true } });
  if (!booking || booking.studentId !== childId || booking.status !== "SCHEDULED" || booking.scheduledAt.getTime() <= Date.now()) {
    throw new ParentAskError("That class is no longer coming up.");
  }
  const parents = await prisma.parentLink.findMany({ where: { childId, status: "ACCEPTED" }, select: { parentId: true } });
  if (parents.length === 0) throw new ParentAskError("No parent is linked to your account.");

  const href = parentMoveHref(childId, bookingId);
  const already = await prisma.notification.findFirst({
    where: { userId: { in: parents.map((p) => p.parentId) }, type: "PARENT_CLASS_ASK", href, createdAt: { gt: new Date(Date.now() - PARENT_ASK_REPEAT_HOURS * HOUR_MS) } },
    select: { id: true },
  });
  if (already) return "already";
  await consumeRateLimit(prisma, `parent-ask:${childId}`, { windowMinutes: 24 * 60, max: 6, message: "You have asked a lot today. Your parent has your earlier requests." });

  const child = await prisma.user.findUniqueOrThrow({ where: { id: childId }, select: { name: true, email: true } });
  const when = formatEtDateTime(booking.scheduledAt);
  for (const { parentId } of parents) {
    await createNotification({
      userId: parentId,
      type: "PARENT_CLASS_ASK",
      title: `${firstName(child)} asked you to move or skip a class`,
      body: `${child.name ?? child.email} would like their ${when} class moved or skipped. Open it to pick a new time or cancel it.`,
      emailCategory: "classes",
      cta: { label: "Move or skip it", path: href },
      href,
    });
  }
  return "asked";
}

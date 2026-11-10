import { prisma } from "@/lib/prisma";
import { chunksForSchedule, getReservableSlots, type ReservableSlot } from "@/lib/classSchedule";
import { addMinutesToHHmm } from "@/lib/classScheduleLabels";
import { createNotification } from "@/lib/notifications";
import { OWNER_EMAIL } from "@/lib/adminNotifications";
import { DAY_NAMES, formatTimeLabel } from "@/lib/weeklyTimeLabels";
import { OFFERED_PLAN_CADENCE, PLAN_CADENCE_CREDITS_PER_WEEK } from "@/lib/classCreditPricing";
import { MAX_WAITLIST_ENTRIES, WAITLIST_HOLD_HOURS, WAITLIST_KEEP_DAYS, slotKey } from "@/lib/slotWaitlistRules";

export class WaitlistError extends Error {}

const CREDITS = () => PLAN_CADENCE_CREDITS_PER_WEEK[OFFERED_PLAN_CADENCE];

/** Weekly times other plans hold right now, in the same shape the picker uses, so a student can ask to be told when one frees up. */
export async function getTakenSlots(): Promise<ReservableSlot[]> {
  const [schedules, open] = await Promise.all([prisma.classSchedule.findMany({ where: { active: true }, orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] }), getReservableSlots(CREDITS())]);
  const openKeys = new Set(open.map((s) => slotKey(s.scheduleId, s.chunkIndex)));
  const taken: ReservableSlot[] = [];
  for (const schedule of schedules) {
    for (const chunk of chunksForSchedule(schedule)) {
      if (chunk.creditCost < CREDITS() || openKeys.has(slotKey(schedule.id, chunk.chunkIndex))) continue;
      taken.push({
        scheduleId: schedule.id,
        label: schedule.label,
        dayOfWeek: schedule.dayOfWeek,
        startTime: addMinutesToHHmm(schedule.startTime, chunk.offsetMin),
        chunkIndex: chunk.chunkIndex,
        creditCost: chunk.creditCost,
        seats: schedule.seats,
        seatsLeft: 0,
      });
    }
  }
  return taken;
}

export async function getMyWaitlist(userId: string): Promise<string[]> {
  const rows = await prisma.slotWaitlist.findMany({ where: { userId }, select: { scheduleId: true, chunkIndex: true } });
  return rows.map((r) => slotKey(r.scheduleId, r.chunkIndex));
}

export async function joinWaitlist(userId: string, scheduleId: string, chunkIndex: number): Promise<void> {
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) throw new WaitlistError("That time does not exist.");
  const taken = await getTakenSlots();
  const slot = taken.find((s) => s.scheduleId === scheduleId && s.chunkIndex === chunkIndex);
  if (!slot) throw new WaitlistError("That time is open right now. You can pick it directly, no waiting needed.");
  const mine = await prisma.slotWaitlist.count({ where: { userId } });
  if (mine >= MAX_WAITLIST_ENTRIES) throw new WaitlistError(`You can wait for up to ${MAX_WAITLIST_ENTRIES} times at once. Remove one first.`);
  const key = { userId_scheduleId_chunkIndex: { userId, scheduleId, chunkIndex } };
  const already = await prisma.slotWaitlist.findUnique({ where: key, select: { id: true } });
  await prisma.slotWaitlist.upsert({ where: key, create: { userId, scheduleId, chunkIndex }, update: {} });
  // Told once, the first time someone asks for that time (asking again, or someone else's own entry, never repeats it).
  if (!already) await tellOwnerSomeoneIsWaiting(userId, slot);
}

/** Where the owner sets up a plan for this student with this weekly time already picked (Set up plan opens on their page). */
export function setupLinkFor(userId: string, scheduleId: string, chunkIndex: number): string {
  return `/admin/users/${userId}?do=setup&slot=${slotKey(scheduleId, chunkIndex)}`;
}

/** Who is waiting for each class of these windows, oldest first, for the Times list on Classes > Schedule. */
export async function getWaitlistByWindow(scheduleIds: string[]): Promise<Map<string, { userId: string; name: string; chunkIndex: number }[]>> {
  const rows = scheduleIds.length
    ? await prisma.slotWaitlist.findMany({ where: { scheduleId: { in: scheduleIds } }, orderBy: { createdAt: "asc" }, select: { scheduleId: true, chunkIndex: true, user: { select: { id: true, name: true, email: true } } } })
    : [];
  const out = new Map<string, { userId: string; name: string; chunkIndex: number }[]>();
  for (const r of rows) out.set(r.scheduleId, [...(out.get(r.scheduleId) ?? []), { userId: r.user.id, name: r.user.name ?? r.user.email, chunkIndex: r.chunkIndex }]);
  return out;
}

/**
 * Tells the owner, and only the owner, that a student is waiting for a taken weekly time: "Jordan is looking forward to Tuesdays at
 * 6:00 PM becoming available." A bell notice that opens Set up plan on the student's page with that time picked (it says whose time it
 * is while it is taken); no email, and never to other admins. Never fails the join.
 */
async function tellOwnerSomeoneIsWaiting(userId: string, slot: ReservableSlot): Promise<void> {
  try {
    const [student, owner] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
      prisma.user.findFirst({ where: { email: { equals: OWNER_EMAIL, mode: "insensitive" } }, select: { id: true } }),
    ]);
    if (!student || !owner || owner.id === userId) return;
    await createNotification({
      userId: owner.id,
      type: "ADMIN_ALERT",
      title: "Someone is waiting for a weekly time",
      body: `${student.name ?? student.email} is looking forward to ${DAY_NAMES[slot.dayOfWeek]}s at ${formatTimeLabel(slot.startTime)} becoming available.`,
      cta: { label: "Set up their plan", path: setupLinkFor(userId, slot.scheduleId, slot.chunkIndex) },
    });
  } catch (err) {
    console.error("Waitlist owner notice failed (non-blocking):", err);
  }
}

export async function leaveWaitlist(userId: string, scheduleId: string, chunkIndex: number): Promise<void> {
  await prisma.slotWaitlist.deleteMany({ where: { userId, scheduleId, chunkIndex } });
}

/**
 * Run hourly. For every waitlisted time that is open again, tells the first person in line, then waits WAITLIST_HOLD_HOURS before telling
 * the next, so a freed time is offered to one person at a time. Also clears entries for people who already hold a plan on that time, and old ones.
 */
export async function notifyOpenedSlots(now: Date = new Date()): Promise<{ notified: number; cleared: number }> {
  const entries = await prisma.slotWaitlist.findMany({ orderBy: { createdAt: "asc" }, include: { schedule: { select: { dayOfWeek: true, startTime: true, label: true, active: true } } } });
  if (entries.length === 0) return { notified: 0, cleared: 0 };

  let cleared = 0;
  const stale = entries.filter((e) => now.getTime() - e.createdAt.getTime() > WAITLIST_KEEP_DAYS * 86_400_000 || !e.schedule.active).map((e) => e.id);
  if (stale.length > 0) cleared += (await prisma.slotWaitlist.deleteMany({ where: { id: { in: stale } } })).count;
  // Someone who already holds a plan on that very time no longer needs to wait for it.
  const holders = await prisma.paymentPlan.findMany({
    where: { userId: { in: [...new Set(entries.map((e) => e.userId))] }, status: "ACTIVE", reservedScheduleId: { not: null } },
    select: { userId: true, reservedScheduleId: true, reservedChunkIndex: true },
  });
  const holding = new Set(holders.map((h) => `${h.userId}:${slotKey(h.reservedScheduleId!, h.reservedChunkIndex ?? -1)}`));
  const satisfied = entries.filter((e) => holding.has(`${e.userId}:${slotKey(e.scheduleId, e.chunkIndex)}`)).map((e) => e.id);
  if (satisfied.length > 0) cleared += (await prisma.slotWaitlist.deleteMany({ where: { id: { in: satisfied } } })).count;
  const live = entries.filter((e) => !stale.includes(e.id) && !satisfied.includes(e.id));

  const open = new Set((await getReservableSlots(CREDITS())).map((s) => slotKey(s.scheduleId, s.chunkIndex)));
  const bySlot = new Map<string, typeof live>();
  for (const e of live) {
    const key = slotKey(e.scheduleId, e.chunkIndex);
    bySlot.set(key, [...(bySlot.get(key) ?? []), e]);
  }

  let notified = 0;
  for (const [key, queue] of bySlot) {
    if (!open.has(key)) {
      // Taken again: whoever was told stays on the list, but the next freeing starts a fresh offer.
      await prisma.slotWaitlist.updateMany({ where: { id: { in: queue.map((e) => e.id) }, notifiedAt: { not: null } }, data: { notifiedAt: null } });
      continue;
    }
    const lastOffer = Math.max(0, ...queue.map((e) => e.notifiedAt?.getTime() ?? 0));
    if (lastOffer > 0 && now.getTime() - lastOffer < WAITLIST_HOLD_HOURS * 3_600_000) continue;
    const next = queue.find((e) => e.notifiedAt === null);
    if (!next) continue;
    const claimed = await prisma.slotWaitlist.updateMany({ where: { id: next.id, notifiedAt: null }, data: { notifiedAt: now } });
    if (claimed.count !== 1) continue;
    const day = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"][next.schedule.dayOfWeek];
    await createNotification({
      userId: next.userId,
      type: "SLOT_WAITLIST_OPENED",
      title: "Your weekly time is open",
      body: `${day} ${next.schedule.label ? `(${next.schedule.label}) ` : ""}just opened up. Times go to whoever picks them first, so start your plan soon if you want it.`,
      emailCategory: "classes",
      // Opens the weekly-time picker with this time chosen (or the plan form with it, for someone with no plan yet).
      cta: { label: "Pick your time", path: `/lessons?changeTime=${encodeURIComponent(slotKey(next.scheduleId, next.chunkIndex))}` },
    }).catch((err) => console.error("Waitlist notice failed (non-blocking):", err));
    notified += 1;
  }
  return { notified, cleared };
}

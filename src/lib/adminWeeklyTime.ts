import { prisma } from "@/lib/prisma";
import { PLAN_CADENCE_CREDITS_PER_WEEK } from "@/lib/classCreditPricing";
import { chunksForSchedule } from "@/lib/classSchedule";
import { addMinutesToHHmm } from "@/lib/classScheduleLabels";
import { PaymentPlanError, changeReservedSlot } from "@/lib/paymentPlans";
import { logAudit } from "@/lib/audit";
import { releaseHoldsFor } from "@/lib/contacts";
import { sameInboxEmail } from "@/lib/slotHolds";
import { checkTypedWeeklyTime, clashRefusal, findClashes, getWeeklyTimeOptions, weeklyWindowFor, type TimeClash, type WeeklyTimeOption } from "@/lib/weeklyTimeOptions";
import { weeklyTimeLabel, type TypedWeeklyTime } from "@/lib/weeklyTimeRules";

/**
 * "Weekly time" on the student page: the studio moves one person's standing weekly class, and every upcoming class on it, to another
 * time in one step. Works for any running plan, a person on a group or parent plan included (each has their own weekly time), with no
 * 24 hour cutoff. Later cycles are booked at the new time as they are paid, because the plan's reserved time is what moves.
 *
 * Every time no other plan keeps is listed, with what is in the way named: another person's class on it (moved right there, then the
 * time is free), a contact it is kept for (asked first), and who is waiting for it. "Another time…" types a day and start time that has
 * no window yet; a 45 minute window is made for it.
 */

export interface WeeklyTimeChoice {
  key: string;
  /** The window, or "" for a typed time that has none yet (`newTime`). */
  scheduleId: string;
  chunkIndex: number;
  dayOfWeek: number;
  /** "Monday 6:00 PM to 6:45 PM". */
  label: string;
  newTime: TypedWeeklyTime | null;
  /** Other people's classes on this time from today on: move them first, then the time is free. */
  clashes: TimeClash[];
  /** Contacts this time is kept for; `mine` when the contact is this same person (same email). */
  holds: { contactName: string; mine: boolean }[];
  waiting: string[];
}

async function loadPlan(planId: string) {
  const plan = await prisma.paymentPlan.findUnique({ where: { id: planId }, include: { user: { select: { email: true } } } });
  if (!plan || plan.status !== "ACTIVE") throw new PaymentPlanError("Only a running plan has a weekly time to move.");
  return plan;
}

function toChoice(o: WeeklyTimeOption, email: string): WeeklyTimeChoice {
  return {
    key: o.key,
    scheduleId: o.scheduleId ?? "",
    chunkIndex: o.chunkIndex,
    dayOfWeek: o.dayOfWeek,
    label: o.label,
    newTime: o.newTime,
    clashes: o.clashes,
    holds: o.holds.map((h) => ({ contactName: h.contactName, mine: sameInboxEmail(h.email, email) })),
    waiting: o.waiting.map((w) => w.name),
  };
}

/** The plan's current weekly time (null when it has none yet) and every time it could move to. */
export async function getWeeklyTimeChoices(planId: string): Promise<{ current: WeeklyTimeChoice | null; choices: WeeklyTimeChoice[] }> {
  const plan = await loadPlan(planId);
  const options = await getWeeklyTimeOptions({ creditsPerWeek: PLAN_CADENCE_CREDITS_PER_WEEK[plan.cadence], ignoreUserIds: [plan.userId], ignorePlanIds: [plan.id] });
  let current: WeeklyTimeChoice | null = null;
  if (plan.reservedScheduleId && plan.reservedChunkIndex !== null) {
    const schedule = await prisma.classSchedule.findUnique({ where: { id: plan.reservedScheduleId } });
    const chunk = schedule ? chunksForSchedule(schedule)[plan.reservedChunkIndex] : undefined;
    if (schedule && chunk) {
      const start = addMinutesToHHmm(schedule.startTime, chunk.offsetMin);
      current = { key: `${schedule.id}:${plan.reservedChunkIndex}`, scheduleId: schedule.id, chunkIndex: plan.reservedChunkIndex, dayOfWeek: schedule.dayOfWeek, label: weeklyTimeLabel(schedule.dayOfWeek, start), newTime: null, clashes: [], holds: [], waiting: [] };
    }
  }
  const choices = options.filter((o) => o.key !== current?.key).map((o) => toChoice(o, plan.user.email));
  return { current, choices };
}

/** "Another time…": the typed day and start time as a choice for this plan, or a plain reason it cannot be. */
export async function typedWeeklyTimeChoice(planId: string, time: { dayOfWeek: unknown; startTime: unknown }): Promise<WeeklyTimeChoice> {
  const plan = await loadPlan(planId);
  const option = await checkTypedWeeklyTime(time, { creditsPerWeek: PLAN_CADENCE_CREDITS_PER_WEEK[plan.cadence], ignoreUserIds: [plan.userId], ignorePlanIds: [plan.id] });
  if (option.key === `${plan.reservedScheduleId}:${plan.reservedChunkIndex}`) throw new PaymentPlanError("That is already their weekly time.");
  return toChoice(option, plan.user.email);
}

/**
 * Moves the plan's weekly time and every upcoming class on it, to a listed time or a typed one (made as a window first). Refused, with who
 * and when, while another person has a class on the new time: the owner moves that class from the same dialog, then tries again. The
 * student is told through changeReservedSlot (muted by the Notify switch).
 */
export async function moveWeeklyTime(
  planId: string,
  adminId: string,
  to: { scheduleId: string; chunkIndex: number } | { newTime: TypedWeeklyTime } | string,
  /** With a schedule id as `to` (the older call shape): which class of that window. */
  chunkIndexArg = 0,
): Promise<string> {
  const target = typeof to === "string" ? { scheduleId: to, chunkIndex: chunkIndexArg } : to;
  const plan = await loadPlan(planId);
  const { current, choices } = await getWeeklyTimeChoices(planId);
  let pick: WeeklyTimeChoice | undefined;
  if ("newTime" in target) {
    pick = await typedWeeklyTimeChoice(planId, target.newTime);
  } else {
    pick = choices.find((c) => c.scheduleId === target.scheduleId && c.chunkIndex === target.chunkIndex);
    if (!pick) throw new PaymentPlanError("That time is taken or no longer offered. Pick another.");
  }
  if (pick.clashes.length > 0) throw new PaymentPlanError(clashRefusal(pick.clashes, false));

  // A typed time with no window yet gets one now. If the move then fails, the empty window is taken away again.
  let scheduleId = pick.scheduleId;
  let chunkIndex = pick.chunkIndex;
  let created = false;
  if (pick.newTime) {
    const newTime = pick.newTime;
    const made = await prisma.$transaction((tx) => weeklyWindowFor(tx, newTime));
    ({ scheduleId, chunkIndex, created } = made);
  }
  try {
    // The same check as the dialog, against the window itself: nobody else's class runs into the new time from today on.
    const schedule = await prisma.classSchedule.findUniqueOrThrow({ where: { id: scheduleId } });
    const start = addMinutesToHHmm(schedule.startTime, chunksForSchedule(schedule)[chunkIndex]?.offsetMin ?? 0);
    const clashes = await findClashes(prisma, { scheduleId, dayOfWeek: schedule.dayOfWeek, startTime: start }, { ignoreUserIds: [plan.userId] });
    if (clashes.length > 0) throw new PaymentPlanError(clashRefusal(clashes, false));
    await changeReservedSlot(plan.userId, scheduleId, chunkIndex, { byAdmin: true });
  } catch (err) {
    if (created) await prisma.classSchedule.deleteMany({ where: { id: scheduleId, bookings: { none: {} }, reservedByPlans: { none: {} }, slotHolds: { none: {} } } }).catch(() => undefined);
    throw err;
  }
  await releaseHoldsFor(prisma, plan.user.email, scheduleId, chunkIndex).catch(() => undefined);
  if (created) await logAudit({ actorId: adminId, action: "schedule.add-time", targetType: "ClassSchedule", targetId: scheduleId, detail: `Added ${pick.label} with Weekly time for ${plan.user.email}` }).catch(() => undefined);
  await logAudit({ actorId: adminId, action: "plan.move-time", targetType: "PaymentPlan", targetId: plan.id, detail: `Weekly time moved from ${current?.label ?? "none"} to ${pick.label}` }).catch(() => undefined);
  return pick.label;
}

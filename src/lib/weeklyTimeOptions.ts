import type { ClassSchedule, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CLASS_MINUTES } from "@/lib/classCreditPricing";
import { chunksForSchedule, computeScheduledAt, livePaymentPlanConditions, ONE_OFF_LABEL } from "@/lib/classSchedule";
import { addMinutesToHHmm } from "@/lib/classScheduleLabels";
import { ClassScheduleError, ensureWeeklyWindow } from "@/lib/classScheduleManage";
import { PaymentPlanError } from "@/lib/paymentPlans";
import {
  clashSummary,
  firstNameOf,
  fitRefusal,
  fitWeeklyTime,
  parseWeeklyTime,
  weeklyTimeLabel,
  type TypedWeeklyTime,
  type WindowShape,
} from "@/lib/weeklyTimeRules";

/**
 * The weekly times the owner can give a plan, with what stands in the way named instead of hidden: another person's class on one of its
 * weeks (a clash), a contact the time is kept for (a hold, a reminder only), and the students waiting for it. Shared by Set up plan,
 * Weekly time and the plan builder. getReservableSlots (classSchedule.ts) stays the students' own list; this is the owner's.
 *
 * A clash is another student's class at one of the time's weekly classes from today on: on the same window at that exact start (the rule
 * getReservableSlots and changeReservedSlot use), or on a one-off time (a custom move) that overlaps it (the rule the students' own list
 * uses). The checks that write (assertWeeklyTimeOpen) use the same rule, so a time is never reserved over a real class.
 */

type Db = Prisma.TransactionClient | typeof prisma;

export interface TimeClash {
  bookingId: string;
  studentId: string;
  name: string;
  firstName: string;
  /** The class's Eastern date, YYYY-MM-DD. */
  date: string;
  /** When it starts (ISO). */
  at: string;
}

export interface TimeHold {
  holdId: string;
  contactId: string;
  contactName: string;
  email: string | null;
}

export interface TimeWaiter {
  userId: string;
  name: string;
}

export interface WeeklyTimeOption {
  key: string;
  /** The window, or null for a time typed with "Another time…" that has none yet (a 45 minute window is made when it is used). */
  scheduleId: string | null;
  chunkIndex: number;
  dayOfWeek: number;
  /** This class's own start, "HH:mm" Eastern. */
  startTime: string;
  /** "Tuesday 4:00 PM to 4:45 PM". */
  label: string;
  newTime: TypedWeeklyTime | null;
  clashes: TimeClash[];
  holds: TimeHold[];
  waiting: TimeWaiter[];
}

export const newTimeKey = (t: TypedWeeklyTime) => `new:${t.dayOfWeek}:${t.startTime}`;

const etYmd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const todayUtcMidnight = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};
const ONE_CHUNK = { chunkIndex: 0, offsetMin: 0, creditCost: 2 };

interface FutureBooking {
  id: string;
  studentId: string;
  scheduleId: string;
  schedule: { label: string | null };
  occurrenceDate: Date;
  scheduledAt: Date;
  student: { name: string | null; email: string };
}

/** Every class still to come that could overlap a weekly class starting at or after `from`. */
async function futureBookings(db: Db, from: Date): Promise<FutureBooking[]> {
  const after = new Date(Math.max(Date.now(), from.getTime() - CLASS_MINUTES * 60_000));
  return db.classBooking.findMany({
    where: { status: "SCHEDULED", scheduledAt: { gt: after } },
    select: { id: true, studentId: true, scheduleId: true, schedule: { select: { label: true } }, occurrenceDate: true, scheduledAt: true, student: { select: { name: true, email: true } } },
    orderBy: { scheduledAt: "asc" },
  });
}

/** The weekly time a clash is looked for on: its window (null for a typed time with no window yet), its day and its class's start. */
export interface ClashTime {
  scheduleId: string | null;
  dayOfWeek: number;
  startTime: string;
}

/** The classes in `bookings` that sit on this weekly time's class on their own day, from `from` on, leaving out `ignoreUserIds`. */
function clashesWith(time: ClashTime, bookings: FutureBooking[], ignoreUserIds: string[], from: Date): TimeClash[] {
  const span = CLASS_MINUTES * 60_000;
  const out: TimeClash[] = [];
  for (const b of bookings) {
    if (ignoreUserIds.includes(b.studentId) || b.occurrenceDate.getUTCDay() !== time.dayOfWeek) continue;
    const weekly = computeScheduledAt({ startTime: time.startTime }, b.occurrenceDate, ONE_CHUNK);
    if (weekly.getTime() < from.getTime()) continue;
    const sameWindow = b.scheduleId === time.scheduleId && b.scheduledAt.getTime() === weekly.getTime();
    const oneOff = b.schedule.label === ONE_OFF_LABEL && Math.abs(b.scheduledAt.getTime() - weekly.getTime()) < span;
    if (!sameWindow && !oneOff) continue;
    out.push({ bookingId: b.id, studentId: b.studentId, name: b.student.name ?? b.student.email, firstName: firstNameOf(b.student.name, b.student.email), date: etYmd(b.scheduledAt), at: b.scheduledAt.toISOString() });
  }
  return out;
}

/** Other people's classes on this weekly time from `from` on (today when it is left out). `ignoreBookingIds` are classes moving away too. */
export async function findClashes(
  db: Db,
  time: ClashTime,
  options: { from?: Date; ignoreUserIds?: string[]; ignoreBookingIds?: string[] } = {},
): Promise<TimeClash[]> {
  const from = options.from ?? new Date();
  const skip = new Set(options.ignoreBookingIds ?? []);
  return clashesWith(time, (await futureBookings(db, from)).filter((b) => !skip.has(b.id)), options.ignoreUserIds ?? [], from);
}

/** The offered windows of a day (or every day) as the pure rules need them. */
export async function windowShapes(db: Db, dayOfWeek?: number): Promise<WindowShape[]> {
  const rows = await db.classSchedule.findMany({ where: { active: true, ...(dayOfWeek === undefined ? {} : { dayOfWeek }) } });
  return rows.map((s) => ({ id: s.id, dayOfWeek: s.dayOfWeek, startTime: s.startTime, chunkOffsets: chunksForSchedule(s).map((c) => c.offsetMin) }));
}

/**
 * Every weekly time a plan could take: each offered class long enough for a weekly class that no other live plan keeps (`ignorePlanIds`
 * are this person's own plans, so their own time is listed too), each with its clashes, holds and waiting list.
 */
export async function getWeeklyTimeOptions(options: { creditsPerWeek: number; ignoreUserIds: string[]; ignorePlanIds: string[] }): Promise<WeeklyTimeOption[]> {
  const now = new Date();
  const [schedules, plans, bookings, holds, waits] = await Promise.all([
    prisma.classSchedule.findMany({ where: { active: true }, orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] }),
    prisma.paymentPlan.findMany({ where: { reservedScheduleId: { not: null }, OR: livePaymentPlanConditions() }, select: { id: true, reservedScheduleId: true, reservedChunkIndex: true } }),
    futureBookings(prisma, now),
    prisma.slotHold.findMany({
      where: { releasedAt: null, OR: [{ until: null }, { until: { gte: todayUtcMidnight() } }] },
      select: { id: true, scheduleId: true, chunkIndex: true, contact: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.slotWaitlist.findMany({ select: { scheduleId: true, chunkIndex: true, user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } }),
  ]);
  const held = new Set(plans.filter((p) => !options.ignorePlanIds.includes(p.id)).map((p) => `${p.reservedScheduleId}:${p.reservedChunkIndex}`));
  const out: WeeklyTimeOption[] = [];
  for (const schedule of schedules) {
    for (const chunk of chunksForSchedule(schedule)) {
      if (chunk.creditCost < options.creditsPerWeek) continue;
      const key = `${schedule.id}:${chunk.chunkIndex}`;
      if (held.has(key)) continue;
      const startTime = addMinutesToHHmm(schedule.startTime, chunk.offsetMin);
      out.push({
        key,
        scheduleId: schedule.id,
        chunkIndex: chunk.chunkIndex,
        dayOfWeek: schedule.dayOfWeek,
        startTime,
        label: weeklyTimeLabel(schedule.dayOfWeek, startTime),
        newTime: null,
        clashes: clashesWith({ scheduleId: schedule.id, dayOfWeek: schedule.dayOfWeek, startTime }, bookings, options.ignoreUserIds, now),
        holds: holds.filter((h) => h.scheduleId === schedule.id && h.chunkIndex === chunk.chunkIndex).map((h) => ({ holdId: h.id, contactId: h.contact.id, contactName: h.contact.name, email: h.contact.email })),
        waiting: waits.filter((w) => w.scheduleId === schedule.id && w.chunkIndex === chunk.chunkIndex && !options.ignoreUserIds.includes(w.user.id)).map((w) => ({ userId: w.user.id, name: w.user.name ?? w.user.email })),
      });
    }
  }
  return out.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
}

/** Whose live plan keeps this weekly time, leaving out `ignorePlanIds`, or null. */
async function keptBy(db: Db, scheduleId: string, chunkIndex: number, ignorePlanIds: string[]): Promise<string | null> {
  const plan = await db.paymentPlan.findFirst({
    where: { reservedScheduleId: scheduleId, reservedChunkIndex: chunkIndex, id: { notIn: ignorePlanIds }, OR: livePaymentPlanConditions() },
    select: { user: { select: { name: true, email: true } } },
  });
  return plan ? firstNameOf(plan.user.name, plan.user.email) : null;
}

/** A virtual window for a typed time that has none yet, so dates and labels can be worked out before anything is made. */
export function virtualWindow(time: TypedWeeklyTime): ClassSchedule {
  return { id: "", dayOfWeek: time.dayOfWeek, startTime: time.startTime, durationMin: CLASS_MINUTES, creditCost: 2, label: null, active: true, createdAt: new Date() };
}

/**
 * "Another time…": checks a typed day and start time for someone (`ignoreUserIds`, `ignorePlanIds` are theirs) and gives it as a choice.
 * A time that is already one of a window's classes is that class (refused when another plan keeps it). A time that runs into another
 * class is refused. Anything else is a new time, made as a 45 minute window when it is used. `ignoreWindowIds` leaves out windows about to
 * be retired. Throws PaymentPlanError with a plain reason.
 */
export async function checkTypedWeeklyTime(
  input: { dayOfWeek: unknown; startTime: unknown },
  options: { creditsPerWeek: number; ignoreUserIds: string[]; ignorePlanIds: string[]; ignoreWindowIds?: string[] },
): Promise<WeeklyTimeOption> {
  const time = parseWeeklyTime(input);
  if ("error" in time) throw new PaymentPlanError(time.error);
  const fit = fitWeeklyTime(await windowShapes(prisma, time.dayOfWeek), time, options.ignoreWindowIds);
  const refusal = fitRefusal(fit, time.dayOfWeek);
  if (refusal) throw new PaymentPlanError(refusal);
  if (fit.kind === "existing") {
    const owner = await keptBy(prisma, fit.scheduleId, fit.chunkIndex, options.ignorePlanIds);
    if (owner) throw new PaymentPlanError(`That is ${owner}'s weekly time. Pick another.`);
    const option = (await getWeeklyTimeOptions(options)).find((o) => o.scheduleId === fit.scheduleId && o.chunkIndex === fit.chunkIndex);
    if (!option) throw new PaymentPlanError("That time is too short for a weekly class. Pick another.");
    return option;
  }
  return {
    key: newTimeKey(time),
    scheduleId: null,
    chunkIndex: 0,
    dayOfWeek: time.dayOfWeek,
    startTime: time.startTime,
    label: weeklyTimeLabel(time.dayOfWeek, time.startTime),
    newTime: time,
    clashes: await findClashes(prisma, { scheduleId: null, ...time }, { ignoreUserIds: options.ignoreUserIds }),
    holds: [],
    waiting: [],
  };
}

/** Why a weekly time with these clashes cannot be reserved, said with who and when. */
export function clashRefusal(clashes: TimeClash[], canStartLater: boolean): string {
  const one = clashes.length === 1;
  const who = one ? `${clashes[0].firstName} has a class at this time on ${new Date(`${clashes[0].date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}` : `${clashSummary(clashes)} at this time`;
  if (canStartLater) return `${who}. Start after ${one ? "it" : "them"}, or move ${one ? "that class" : "those classes"} first.`;
  return `${who}. Move ${one ? "that class" : "those classes"} first, or pick another time.`;
}

/**
 * The check that writes: the weekly time is offered and long enough, no other live plan keeps it, and nobody else (`memberIds` are the
 * people the plan is for) has a class on it from `from` on. Run inside the transaction that reserves it. Throws PaymentPlanError.
 */
export async function assertWeeklyTimeOpen(
  db: Db,
  input: { scheduleId: string; chunkIndex: number; from: Date; memberIds: string[]; ignorePlanIds: string[]; creditsPerWeek: number; canStartLater: boolean },
): Promise<void> {
  const schedule = await db.classSchedule.findUnique({ where: { id: input.scheduleId } });
  if (!schedule || !schedule.active) throw new PaymentPlanError("That class time is no longer offered. Pick another.");
  const chunk = chunksForSchedule(schedule)[input.chunkIndex];
  if (!chunk) throw new PaymentPlanError("That time slot does not exist.");
  if (chunk.creditCost < input.creditsPerWeek) throw new PaymentPlanError("That time slot is too short for a weekly class.");
  const owner = await keptBy(db, input.scheduleId, input.chunkIndex, input.ignorePlanIds);
  if (owner) throw new PaymentPlanError(`That is ${owner}'s weekly time now. Pick another.`);
  const clashes = await findClashes(db, { scheduleId: schedule.id, dayOfWeek: schedule.dayOfWeek, startTime: addMinutesToHHmm(schedule.startTime, chunk.offsetMin) }, { from: input.from, ignoreUserIds: input.memberIds });
  if (clashes.length > 0) throw new PaymentPlanError(clashRefusal(clashes, input.canStartLater));
}

/** Makes (or finds) the window for a typed time inside a transaction, with the plan tools' own error type. */
export async function weeklyWindowFor(tx: Prisma.TransactionClient, time: TypedWeeklyTime, options: { ignoreWindowIds?: string[] } = {}): Promise<{ scheduleId: string; chunkIndex: number; created: boolean }> {
  try {
    return await ensureWeeklyWindow(tx, time, options);
  } catch (err) {
    if (err instanceof ClassScheduleError) throw new PaymentPlanError(err.message);
    throw err;
  }
}

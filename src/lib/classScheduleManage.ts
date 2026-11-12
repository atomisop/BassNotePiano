// The admin screens that add, edit and retire the recurring weekly slots. Split out of
// classSchedule.ts, which keeps booking and the shared time and slot rules.

import type { Prisma } from "@prisma/client";
import { notifyAdmins } from "@/lib/adminNotifications";
import { createNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { chunksForSchedule, computeScheduledAt, livePaymentPlanConditions, ONE_OFF_LABEL } from "@/lib/classSchedule";
import { adminCancelClassBooking } from "@/lib/classScheduleAdmin";
import { addMinutesToHHmm, formatEtDateTime } from "@/lib/classScheduleLabels";
import { CLASS_MINUTES } from "@/lib/classCreditPricing";
import { planHoldsOccurrence } from "@/lib/planHold";
import { countSeatUnits, holderUnit, parseSeats } from "@/lib/seatRules";
import { clockLabel, firstNameOf, fitRefusal, fitWeeklyTime, namesList, parseWeeklyTime, shortDay, type TypedWeeklyTime } from "@/lib/weeklyTimeRules";

// ---------------------------------------------------------------------------
// Admin: weekly schedule management
//
// The recurring weekly slots (ClassSchedule rows) had no admin UI at all,
// every existing row was created by hand, directly in the database. These
// functions back the first real self-serve way to add, edit, and retire a
// slot without touching the database.
//
// "Remove" a slot always means deactivate, never delete: a hard delete
// would either fail (a foreign key from real ClassBooking history) or
// silently orphan that history. `active: false` is the exact mechanism
// getUpcomingOccurrences() and bookClass() already use to mean "no longer
// offered", this just exposes it through the app instead of a one-off
// script.
// ---------------------------------------------------------------------------

/** A refusal to show as it is. `people` names the students it is about, so the screen can link each one. */
export class ClassScheduleError extends Error {
  constructor(
    message: string,
    readonly people: { userId: string; name: string }[] = [],
  ) {
    super(message);
  }
}

const DAY_NAMES_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface ClassScheduleInput {
  dayOfWeek: number;
  /** "HH:mm", ET wall-clock, same format ClassSchedule.startTime already stores. */
  startTime: string;
  /** "HH:mm", ET wall-clock, end of the window; durationMin/creditCost are derived from (end - start), never entered directly. Classes themselves are always 45 minutes (see chunksForSchedule), so creditCost here is only a display figure. */
  endTime: string;
  label: string | null;
  /** Students who can share each hour-long class of this window (1 when left out on a new window; unchanged when left out on an edit). Whole number, 1 to 1000. */
  seats?: number;
}

/** The seats an add or edit asks for, or a ClassScheduleError with a message meant to be shown as-is. */
export function resolveSeats(raw: number | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = parseSeats(raw);
  if (!parsed.ok) throw new ClassScheduleError(parsed.message);
  return parsed.seats;
}

function parseHHMM(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new ClassScheduleError(`"${value}" isn't a valid time.`);
  }
  return hour * 60 + minute;
}

/** A window is at least one class long (45 minutes) and grows in 15-minute steps, so a single 45-minute class can be posted. */
const MIN_WINDOW_MIN = 45;
const WINDOW_STEP_MIN = 15;

/** Shared validation for create/update, throws ClassScheduleError with a message meant to be shown as-is. */
export function resolveDurationMin(startTime: string, endTime: string): number {
  const startMin = parseHHMM(startTime);
  const endMin = parseHHMM(endTime);
  const durationMin = endMin - startMin;
  if (durationMin <= 0) throw new ClassScheduleError("End time has to be after the start time.");
  if (durationMin < MIN_WINDOW_MIN) throw new ClassScheduleError(`The window has to be at least ${MIN_WINDOW_MIN} minutes, one class.`);
  if (durationMin % WINDOW_STEP_MIN !== 0) throw new ClassScheduleError(`The window has to be a multiple of ${WINDOW_STEP_MIN} minutes.`);
  return durationMin;
}

/** Every schedule row, active or not, unlike getUpcomingOccurrences(), which only ever shows what's currently bookable. */
export async function getAllClassSchedules() {
  // The hidden one-off rows behind custom-time moves are not weekly slots.
  return prisma.classSchedule.findMany({ where: { OR: [{ label: null }, { label: { not: ONE_OFF_LABEL } }] }, orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] });
}

/**
 * "Another time…": the window for one typed weekly time, inside the caller's transaction. A time that is already one of a window's classes
 * is that class; a time that runs into another class is refused (two weekly classes never overlap); anything else gets a new 45 minute
 * window, a normal window like any other (the plan or hold that asked for it keeps it, so students see it as taken).
 * `ignoreWindowIds` leaves out windows about to be retired.
 */
export async function ensureWeeklyWindow(
  tx: Prisma.TransactionClient,
  time: TypedWeeklyTime,
  options: { ignoreWindowIds?: string[] } = {},
): Promise<{ scheduleId: string; chunkIndex: number; created: boolean }> {
  const parsed = parseWeeklyTime(time);
  if ("error" in parsed) throw new ClassScheduleError(parsed.error);
  const rows = await tx.classSchedule.findMany({ where: { active: true, dayOfWeek: parsed.dayOfWeek } });
  const fit = fitWeeklyTime(
    rows.map((s) => ({ id: s.id, dayOfWeek: s.dayOfWeek, startTime: s.startTime, chunkOffsets: chunksForSchedule(s).map((c) => c.offsetMin) })),
    parsed,
    options.ignoreWindowIds,
  );
  if (fit.kind === "existing") return { scheduleId: fit.scheduleId, chunkIndex: fit.chunkIndex, created: false };
  const refusal = fitRefusal(fit, parsed.dayOfWeek);
  if (refusal) throw new ClassScheduleError(refusal);
  const created = await tx.classSchedule.create({
    data: { dayOfWeek: parsed.dayOfWeek, startTime: parsed.startTime, durationMin: CLASS_MINUTES, creditCost: Math.ceil(CLASS_MINUTES / 30), label: null },
  });
  return { scheduleId: created.id, chunkIndex: 0, created: true };
}

export async function createClassSchedule(input: ClassScheduleInput) {
  const durationMin = resolveDurationMin(input.startTime, input.endTime);
  return prisma.classSchedule.create({
    data: {
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      durationMin,
      creditCost: Math.ceil(durationMin / 30),
      label: input.label,
      seats: resolveSeats(input.seats, 1),
    },
  });
}

/** Which class of a window a booking is (the one starting at its time on its day), 0 when none matches exactly. */
export function chunkIndexOf(schedule: { startTime: string; durationMin: number }, occurrenceDate: Date, scheduledAt: Date): number {
  const i = chunksForSchedule(schedule).findIndex((c) => computeScheduledAt(schedule, occurrenceDate, c).getTime() === scheduledAt.getTime());
  return i < 0 ? 0 : i;
}

/** Who is on a weekly window: the live plans that keep one of its classes, and every class still to come on it. */
export async function windowPeople(scheduleId: string) {
  const [plans, bookings] = await Promise.all([
    prisma.paymentPlan.findMany({
      where: { reservedScheduleId: scheduleId, OR: livePaymentPlanConditions() },
      select: { id: true, status: true, userId: true, reservedChunkIndex: true, user: { select: { name: true, email: true } } },
    }),
    prisma.classBooking.findMany({
      where: { scheduleId, status: "SCHEDULED", scheduledAt: { gt: new Date() } },
      orderBy: { scheduledAt: "asc" },
      select: { id: true, studentId: true, occurrenceDate: true, scheduledAt: true, reservedByPlanId: true, student: { select: { name: true, email: true } } },
    }),
  ]);
  return { plans, bookings };
}

/** "Sam (weekly plan) and Ann (Dec 2)", with each person once, for a refusal that names who is on a window. */
function describePeople(people: Awaited<ReturnType<typeof windowPeople>>): { text: string; people: { userId: string; name: string }[] } {
  const seen = new Map<string, { name: string; what: string }>();
  for (const p of people.plans) seen.set(p.userId, { name: p.user.name ?? p.user.email, what: "weekly plan" });
  for (const b of people.bookings) {
    if (seen.has(b.studentId)) continue;
    seen.set(b.studentId, { name: b.student.name ?? b.student.email, what: shortDay(b.occurrenceDate.toISOString().slice(0, 10)) });
  }
  const list = [...seen.entries()].map(([userId, v]) => ({ userId, name: v.name, label: `${firstNameOf(v.name, v.name)} (${v.what})` }));
  return { text: namesList(list.map((p) => p.label), 4), people: list.map(({ userId, name }) => ({ userId, name })) };
}

/**
 * Changes a window's day, times or label. An edit that moves nobody goes straight through: a new label, or a longer or shorter window that
 * keeps the same day and start and still holds every class someone is on. Anything that would move a student's class or weekly time is
 * refused with their names, so the screen can offer "Move everyone with it" (weeklyWindowMove.ts) instead of a silent change.
 */
export async function updateClassSchedule(scheduleId: string, input: ClassScheduleInput) {
  const durationMin = resolveDurationMin(input.startTime, input.endTime);
  const current = await prisma.classSchedule.findUnique({ where: { id: scheduleId } });
  if (!current) throw new ClassScheduleError("That weekly time was not found.");
  const seats = resolveSeats(input.seats, current.seats);
  if (seats < current.seats) await assertSeatsStillHoldEveryone(current, seats);
  const people = await windowPeople(scheduleId);
  if (people.plans.length > 0 || people.bookings.length > 0) {
    const used = new Set<number>(people.plans.map((p) => p.reservedChunkIndex ?? 0));
    for (const b of people.bookings) used.add(chunkIndexOf(current, b.occurrenceDate, b.scheduledAt));
    const sameStart = input.dayOfWeek === current.dayOfWeek && input.startTime === current.startTime;
    const keepsEveryone = sameStart && Math.max(...used) < chunksForSchedule({ durationMin }).length;
    if (!keepsEveryone) {
      const who = describePeople(people);
      throw new ClassScheduleError(`${who.text} ${who.people.length === 1 ? "is" : "are"} on this time, so it cannot just be changed. Move everyone with it, or turn it off and add a new one.`, who.people);
    }
  }

  // A change of day, start or length moves every hour of the window. Reserved days and hours the owner kept would silently move with it, so
  // the owner releases those first; waiting booking requests name the old time, so they are declined (the students are told).
  const timeChanged = input.dayOfWeek !== current.dayOfWeek || input.startTime !== current.startTime || durationMin !== current.durationMin;
  if (timeChanged) {
    const kept = await prisma.ownerReservation.count({ where: { scheduleId, releasedAt: null, occurrenceDate: { gte: new Date(new Date().toISOString().slice(0, 10)) } } });
    if (kept > 0) throw new ClassScheduleError("The owner has reserved days or hours on this time. Release those under Reserved first, then change it.");
  }

  const updated = await prisma.classSchedule.update({
    where: { id: scheduleId },
    data: {
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      durationMin,
      creditCost: Math.ceil(durationMin / 30),
      label: input.label,
      seats,
    },
  });
  if (timeChanged) {
    const waiting = await prisma.bookingRequest.findMany({ where: { scheduleId, status: "PENDING" }, select: { id: true, studentId: true, scheduledAt: true } });
    for (const request of waiting) {
      await prisma.bookingRequest.updateMany({ where: { id: request.id, status: "PENDING" }, data: { status: "DECLINED", decidedAt: new Date(), declineReason: "That time was changed." } });
      await createNotification({
        userId: request.studentId,
        type: "BOOKING_REQUEST_DECLINED",
        title: "Your class request was not confirmed",
        body: `The ${formatEtDateTime(request.scheduledAt)} time you asked for was changed, so the request was closed. Pick a time from the schedule.`,
        emailCategory: "classes",
      }).catch(() => undefined);
    }
  }
  return updated;
}

/**
 * Lowering the seats is refused while any upcoming class of the window already has more people on it than the new number: students in
 * it, plus weekly plans keeping the time (a plan counts once it has no class there yet). Names the slot and how many are on it.
 */
async function assertSeatsStillHoldEveryone(current: { id: string; dayOfWeek: number; startTime: string; durationMin: number }, seats: number): Promise<void> {
  const people = await windowPeople(current.id);
  const rows = await prisma.classBooking.findMany({
    where: { scheduleId: current.id, status: "SCHEDULED", scheduledAt: { gt: new Date() } },
    select: { studentId: true, familyBookingGroupId: true, reservedByPlanId: true, occurrenceDate: true, scheduledAt: true },
  });
  const plans = await prisma.paymentPlan.findMany({
    where: { reservedScheduleId: current.id, OR: livePaymentPlanConditions() },
    select: { userId: true, familyGroupId: true, reservedChunkIndex: true, reservedBookings: { select: { occurrenceDate: true, status: true } } },
  });
  let worst: { taken: number; label: string } | null = null;
  const consider = (taken: number, label: string) => {
    if (taken > seats && (!worst || taken > worst.taken)) worst = { taken, label };
  };
  const instants = new Map<number, typeof rows>();
  for (const r of rows) instants.set(r.scheduledAt.getTime(), [...(instants.get(r.scheduledAt.getTime()) ?? []), r]);
  for (const [at, here] of instants) {
    const chunk = chunkIndexOf(current, here[0].occurrenceDate, here[0].scheduledAt);
    const holders = plans.filter((p) => (p.reservedChunkIndex ?? 0) === chunk && planHoldsOccurrence(p.reservedBookings, here[0].occurrenceDate));
    consider(countSeatUnits(here, holders).taken, formatEtDateTime(new Date(at)));
  }
  for (const chunk of new Set(plans.map((p) => p.reservedChunkIndex ?? 0))) {
    const start = addMinutesToHHmm(current.startTime, chunksForSchedule(current)[chunk]?.offsetMin ?? 0);
    consider(new Set(plans.filter((p) => (p.reservedChunkIndex ?? 0) === chunk).map(holderUnit)).size, `${DAY_NAMES_LONG[current.dayOfWeek]} ${clockLabel(start)} (weekly plans)`);
  }
  if (worst) {
    const w = worst as { taken: number; label: string };
    const who = describePeople(people);
    throw new ClassScheduleError(`${w.label} already has ${w.taken} ${w.taken === 1 ? "person" : "people"} on it, so it cannot go down to ${seats} ${seats === 1 ? "seat" : "seats"}. Move or cancel the extra ${w.taken - seats === 1 ? "class" : "classes"} first.`, who.people);
  }
}

/** Who keeps each class of these windows with a live plan, for the Times list (each name links to the person's page). */
export async function getWindowHolders(scheduleIds: string[]): Promise<Map<string, { userId: string; name: string; chunkIndex: number }[]>> {
  const rows = scheduleIds.length
    ? await prisma.paymentPlan.findMany({
        where: { reservedScheduleId: { in: scheduleIds }, OR: livePaymentPlanConditions() },
        select: { userId: true, reservedScheduleId: true, reservedChunkIndex: true, user: { select: { name: true, email: true } } },
      })
    : [];
  const out = new Map<string, { userId: string; name: string; chunkIndex: number }[]>();
  for (const r of rows) out.set(r.reservedScheduleId!, [...(out.get(r.reservedScheduleId!) ?? []), { userId: r.userId, name: r.user.name ?? r.user.email, chunkIndex: r.reservedChunkIndex ?? 0 }]);
  return out;
}

/** Future SCHEDULED bookings per schedule, for warning the admin before a slot is turned off or edited. */
export async function countUpcomingBookingsBySchedule(scheduleIds: string[]): Promise<Map<string, number>> {
  if (scheduleIds.length === 0) return new Map();
  const rows = await prisma.classBooking.groupBy({
    by: ["scheduleId"],
    where: { scheduleId: { in: scheduleIds }, status: "SCHEDULED", scheduledAt: { gt: new Date() } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.scheduleId, r._count._all]));
}

/**
 * Turning a slot off only stops new bookings. Classes already booked on it
 * still happen (and still send reminders) unless `cancelUpcoming` is set, in
 * which case each one is canceled through the normal admin cancel, so the
 * student is told and nothing is charged. Returns how many were canceled.
 */
export async function setClassScheduleActive(scheduleId: string, active: boolean, opts?: { cancelUpcoming?: boolean }): Promise<number> {
  const schedule = await prisma.classSchedule.update({ where: { id: scheduleId }, data: { active } });
  if (!active) {
    // Subscribers who hold this weekly time stop being booked (the daily job
    // tells each of them once), so make sure an admin knows who to move.
    const holders = await prisma.paymentPlan.findMany({
      where: { reservedScheduleId: scheduleId, OR: livePaymentPlanConditions() },
      select: { userId: true, user: { select: { name: true, email: true } } },
    });
    if (holders.length > 0) {
      const names = holders.map((h) => h.user.name ?? h.user.email);
      const one = holders.length === 1;
      await notifyAdmins("SLOT_PROBLEM", {
        type: "ADMIN_ALERT",
        title: "A reserved weekly time was turned off",
        body: `${namesList(names, 4)} ${one ? "holds" : "hold"} the ${DAY_NAMES_LONG[schedule.dayOfWeek]} ${clockLabel(schedule.startTime)} time you just turned off. Nobody is booked there until you pick ${one ? "them" : "each of them"} a new time (Weekly time on ${one ? "their" : "each"} page).`,
        emailCategory: "classes",
        // One holder: straight to their page. Several: the Times list, which names each holder with a link to their page.
        cta: one ? { label: `Open ${firstNameOf(holders[0].user.name, holders[0].user.email)}`, path: `/admin/users/${holders[0].userId}` } : { label: "See who holds it", path: "/admin/schedule" },
      }).catch((err) => console.error("Slot-off alert failed (non-blocking):", err));
    }
  }
  if (active || !opts?.cancelUpcoming) return 0;

  const upcoming = await prisma.classBooking.findMany({
    where: { scheduleId, status: "SCHEDULED", scheduledAt: { gt: new Date() } },
    select: { id: true },
  });
  let canceled = 0;
  for (const { id } of upcoming) {
    try {
      await adminCancelClassBooking(id, "This class time is no longer offered");
      canceled++;
    } catch (err) {
      console.error(`Canceling booking ${id} on a turned-off slot failed (non-blocking):`, err);
    }
  }
  return canceled;
}


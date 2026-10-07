// The admin screens that add, edit and retire the recurring weekly slots. Split out of
// classSchedule.ts, which keeps booking and the shared time and slot rules.

import { notifyAdmins } from "@/lib/adminNotifications";
import { prisma } from "@/lib/prisma";
import { livePaymentPlanConditions } from "@/lib/classSchedule";
import { adminCancelClassBooking } from "@/lib/classScheduleAdmin";

// ---------------------------------------------------------------------------
// Admin: weekly schedule management
//
// The recurring weekly slots (ClassSchedule rows) had no admin UI at all —
// every existing row was created by hand, directly in the database. These
// functions back the first real self-serve way to add, edit, and retire a
// slot without touching the database.
//
// "Remove" a slot always means deactivate, never delete: a hard delete
// would either fail (a foreign key from real ClassBooking history) or
// silently orphan that history. `active: false` is the exact mechanism
// getUpcomingOccurrences() and bookClass() already use to mean "no longer
// offered" — this just exposes it through the app instead of a one-off
// script.
// ---------------------------------------------------------------------------

export class ClassScheduleError extends Error {}

const DAY_NAMES_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface ClassScheduleInput {
  dayOfWeek: number;
  /** "HH:mm", ET wall-clock — same format ClassSchedule.startTime already stores. */
  startTime: string;
  /** "HH:mm", ET wall-clock — end of the window; durationMin/creditCost are derived from (end - start), never entered directly, so they can never drift out of the 1-credit-per-30-min invariant bookClass depends on. */
  endTime: string;
  label: string | null;
}

function parseHHMM(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new ClassScheduleError(`"${value}" isn't a valid time.`);
  }
  return hour * 60 + minute;
}

/** Shared validation for create/update — throws ClassScheduleError with a message meant to be shown as-is. */
function resolveDurationMin(startTime: string, endTime: string): number {
  const startMin = parseHHMM(startTime);
  const endMin = parseHHMM(endTime);
  const durationMin = endMin - startMin;
  if (durationMin <= 0) throw new ClassScheduleError("End time has to be after the start time.");
  if (durationMin % 30 !== 0) throw new ClassScheduleError("The window has to be a whole number of 30-minute chunks.");
  return durationMin;
}

/** Every schedule row, active or not — unlike getUpcomingOccurrences(), which only ever shows what's currently bookable. */
export async function getAllClassSchedules() {
  return prisma.classSchedule.findMany({ orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] });
}

export async function createClassSchedule(input: ClassScheduleInput) {
  const durationMin = resolveDurationMin(input.startTime, input.endTime);
  return prisma.classSchedule.create({
    data: {
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      durationMin,
      creditCost: durationMin / 30,
      label: input.label,
    },
  });
}

/**
 * Blocks a day/time/duration edit while any ACTIVE Payment Plan reserves
 * this schedule (any chunk within it) — an edit here would silently move or
 * shrink a slot a student is actively paying to hold. Deliberately not
 * checked in setClassScheduleActive (deactivation): the daily reservation
 * job's own notify-once-and-skip handling is the intended path for that
 * case, not a blocked action here — see PaymentPlan.reservedSlotInactiveNotifiedAt.
 */
export async function updateClassSchedule(scheduleId: string, input: ClassScheduleInput) {
  const upcoming = await countUpcomingBookingsBySchedule([scheduleId]);
  if ((upcoming.get(scheduleId) ?? 0) > 0) {
    const n = upcoming.get(scheduleId)!;
    throw new ClassScheduleError(
      `${n} upcoming booking${n === 1 ? " is" : "s are"} on this time. Cancel ${n === 1 ? "it" : "them"} first (Bookings tab), or turn the slot off and add a new one, so no student's class moves without them knowing.`,
    );
  }
  const reservationCount = await prisma.paymentPlan.count({ where: { reservedScheduleId: scheduleId, status: "ACTIVE" } });
  if (reservationCount > 0) {
    throw new ClassScheduleError(
      `${reservationCount} active payment plan${reservationCount === 1 ? "" : "s"} reserve${reservationCount === 1 ? "s" : ""} this schedule. Cancel ${
        reservationCount === 1 ? "it" : "them"
      } or wait for ${reservationCount === 1 ? "it" : "them"} to complete before changing its time.`,
    );
  }

  const durationMin = resolveDurationMin(input.startTime, input.endTime);
  return prisma.classSchedule.update({
    where: { id: scheduleId },
    data: {
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      durationMin,
      creditCost: durationMin / 30,
      label: input.label,
    },
  });
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
    const holders = await prisma.paymentPlan.count({ where: { reservedScheduleId: scheduleId, OR: livePaymentPlanConditions() } });
    if (holders > 0) {
      await notifyAdmins("SLOT_PROBLEM", {
        type: "ADMIN_ALERT",
        title: "A reserved weekly time was turned off",
        body: `${holders} subscriber${holders === 1 ? " holds" : "s hold"} the ${DAY_NAMES_LONG[schedule.dayOfWeek]} ${schedule.startTime} time you just turned off. They will not be booked until you pick them a new time.`,
        emailCategory: "social",
        cta: { label: "See subscribers", path: "/admin/payment-plans" },
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


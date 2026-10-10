// The admin side of weekly classes: the roster, the attendance list, marking attendance and
// cancelling for a student. Split out of classSchedule.ts, which keeps booking and the shared
// time and slot rules.

import { noticeAttendanceRecorded } from "@/lib/studentNotices";
import { creditsLabelFromStored } from "@/lib/classCreditPricing";
import { formatEtDateTime } from "@/lib/classScheduleLabels";
import type { AttendanceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { getRoadmap, type ScaleAccessState } from "@/lib/access";
import { resolveNextStep } from "@/lib/next-step";
import { drawDownCredits, recordCreditGrant } from "@/lib/creditLedger";
import { ClassBookingError, chunksForSchedule, computeScheduledAt, endOfThisWeekEt, nextOccurrenceDates } from "@/lib/classSchedule";

// ---------------------------------------------------------------------------
// Admin: roster + attendance
// ---------------------------------------------------------------------------

export interface RosterFocus {
  /** Curriculum order (0-5) of the scale this student is actually working
      on right now, or null if they have no curriculum access at all yet,
      a distinct bucket from Scale 0, not the same as being new to it. */
  scaleOrder: number | null;
  scaleLabel: string;
  /** What specifically to help them with, "Take the quiz", "Work through
      the module", etc. Same wording the student's own dashboard uses. */
  action: string;
}

/** Reuses the exact same "what's next" logic the student's own dashboard
    is built on (src/lib/next-step.ts). So a class-day roster grouped by
    this can never disagree with what a student sees when they log in. */
function summarizeFocus(roadmap: ScaleAccessState[]): RosterFocus {
  const next = resolveNextStep(roadmap);
  if (next.kind === "buy-curriculum") {
    return { scaleOrder: null, scaleLabel: "No curriculum access", action: "Hasn't unlocked the curriculum yet" };
  }
  // Every other NextStepKind always carries a real scale.
  const scale = next.scale!;
  return {
    scaleOrder: scale.scaleGroup.order,
    scaleLabel: `${scale.scaleGroup.code} · ${scale.scaleGroup.kinitName ?? scale.scaleGroup.title}`,
    action: next.action,
  };
}

export interface AdminOccurrenceRosterEntry {
  bookingId: string;
  studentId: string;
  studentName: string | null;
  studentEmail: string;
  studentImage: string | null;
  status: "SCHEDULED" | "CANCELED" | "COMPLETED";
  attendance: AttendanceStatus | null;
  /** Credits this booking will cost once markAttendance runs. Always
      SOLO_MAX_CREDITS or fewer for a solo booking, always exactly
      FAMILY_CREDITS_PER_STUDENT for a family one. */
  creditsSpent: number;
  /** Shared by every row from the same family booking, null for solo.
      Lets the roster show "these N rows are one family" instead of N
      unrelated-looking students who happen to share a start time. */
  familyBookingGroupId: string | null;
  /** Where this student actually is in the self-paced curriculum right
      now. Lets the roster group "who's here today" by level, for a
      flipped-classroom-style live session (teacher circulates by level
      instead of teaching one lockstep lesson to everyone). */
  focus: RosterFocus;
}

export interface AdminOccurrenceGroup {
  scheduleId: string;
  label: string | null;
  dayOfWeek: number;
  occurrenceDate: Date;
  scheduledAt: Date;
  roster: AdminOccurrenceRosterEntry[];
}

const ADMIN_ROSTER_WINDOW_DAYS = 60;

export interface PendingAttendanceRow {
  bookingId: string;
  studentName: string | null;
  studentEmail: string;
  scheduleLabel: string | null;
  scheduledAt: Date;
}

/**
 * Just the bookings actually needing a Present/No-show call right now,
 * SCHEDULED and already in the past, for the TopBar's own quick-attendance
 * panel. Deliberately its own light query rather than reusing
 * getAdminOccurrences below: that one does a full 60-day window plus a
 * per-student roadmap lookup for the whole Schedule page's roster view,
 * far more than a small polled topbar badge needs on every refresh.
 */
export async function getPendingAttendanceBookings(limit = 20): Promise<PendingAttendanceRow[]> {
  const bookings = await prisma.classBooking.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
    include: { student: { select: { name: true, email: true } }, schedule: { select: { label: true } } },
    orderBy: { scheduledAt: "asc" },
    take: limit,
  });

  return bookings.map((b) => ({
    bookingId: b.id,
    studentName: b.student.name,
    studentEmail: b.student.email,
    scheduleLabel: b.schedule.label,
    scheduledAt: b.scheduledAt,
  }));
}

export interface BookingFeedRow extends PendingAttendanceRow {
  creditsSpent: number;
  /** A subscription whose first payment has not been approved yet: shown with its chosen weekly time, but nothing to mark. */
  awaitingPayment?: boolean;
}

/**
 * Every active (SCHEDULED) class booking, from the oldest one still waiting
 * for an attendance call to the furthest one booked, soonest first. A booking
 * is in here from the instant it is made until it is marked present, absent
 * or canceled, which is what the TopBar badge counts: the same
 * ClassBooking rows the admin Schedule page's bookings tab works on, in a
 * light shape for the TopBar's class-bookings panel (AdminAttendanceQuickPanel).
 * Past ones are the "needs a call" ones; future ones are what is coming.
 */
export async function getBookingFeed(limit = 300): Promise<BookingFeedRow[]> {
  const bookings = await prisma.classBooking.findMany({
    where: { status: "SCHEDULED" },
    include: { student: { select: { name: true, email: true } }, schedule: { select: { label: true } } },
    orderBy: { scheduledAt: "asc" },
    take: limit,
  });
  const weekEnd = endOfThisWeekEt().getTime();
  const rows: BookingFeedRow[] = bookings
    .filter((b) => b.scheduledAt.getTime() < weekEnd) // this week, plus any past class still waiting for an attendance call
    .map((b) => ({
    bookingId: b.id,
    studentName: b.student.name,
    studentEmail: b.student.email,
    scheduleLabel: b.schedule.label,
    scheduledAt: b.scheduledAt,
    creditsSpent: b.creditsSpent,
  }));

  // A new subscription shows up here once its student says they have paid (the
  // payment is waiting for review), as the first class of the weekly time they
  // chose. Someone who started and never finished paying does not appear. The real
  // weekly bookings replace this row as soon as the payment is approved.
  const waiting = await prisma.paymentPlan.findMany({
    where: {
      status: "ACTIVE",
      installmentsPaid: 0,
      reservedScheduleId: { not: null },
      installmentPayments: { some: { status: "PENDING_REVIEW" } },
    },
    include: { user: { select: { name: true, email: true } }, reservedSchedule: true },
  });
  for (const plan of waiting) {
    const slot = plan.reservedSchedule;
    if (!slot || plan.reservedChunkIndex === null || !slot.active) continue;
    const chunk = chunksForSchedule(slot)[plan.reservedChunkIndex];
    if (!chunk) continue;
    // Today's date comes first, so skip it if this week's class already started.
    const upcoming = nextOccurrenceDates(slot.dayOfWeek, 2)
      .map((date) => computeScheduledAt(slot, date, chunk))
      .find((at) => at.getTime() > Date.now());
    if (!upcoming) continue;
    rows.push({
      bookingId: `plan:${plan.id}`,
      studentName: plan.user.name,
      studentEmail: plan.user.email,
      scheduleLabel: slot.label,
      scheduledAt: upcoming,
      creditsSpent: 0,
      awaitingPayment: true,
    });
  }
  return rows.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

/** Every occurrence with at least one non-canceled booking, in the recent-past-to-future window, newest first. */
export async function getAdminOccurrences(): Promise<AdminOccurrenceGroup[]> {
  const windowStart = new Date(Date.now() - ADMIN_ROSTER_WINDOW_DAYS * 86_400_000);
  const bookings = await prisma.classBooking.findMany({
    where: { scheduledAt: { gte: windowStart }, status: { in: ["SCHEDULED", "COMPLETED"] } },
    include: {
      student: { select: { id: true, name: true, email: true, image: true } },
      schedule: { select: { label: true, dayOfWeek: true } },
    },
    orderBy: { scheduledAt: "desc" },
  });

  // One roadmap lookup per distinct student, not per booking row, the same
  // student can appear across several occurrences inside the window, and
  // their curriculum progress doesn't change from one row to the next.
  const studentIds = Array.from(new Set(bookings.map((b) => b.student.id)));
  const focusByStudent = new Map(
    await Promise.all(studentIds.map(async (id) => [id, summarizeFocus(await getRoadmap(id))] as const)),
  );

  const groups = new Map<string, AdminOccurrenceGroup>();
  for (const b of bookings) {
    // Keyed on the exact instant, not just the day, a schedule window that
    // splits into several chunks (see chunksForSchedule) can have a
    // different booking party at each start time, and those shouldn't
    // merge into one roster card.
    const key = `${b.scheduleId}:${b.occurrenceDate.getTime()}:${b.scheduledAt.getTime()}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        scheduleId: b.scheduleId,
        label: b.schedule.label,
        dayOfWeek: b.schedule.dayOfWeek,
        occurrenceDate: b.occurrenceDate,
        scheduledAt: b.scheduledAt,
        roster: [],
      };
      groups.set(key, group);
    }
    group.roster.push({
      bookingId: b.id,
      studentId: b.student.id,
      studentName: b.student.name,
      studentEmail: b.student.email,
      studentImage: b.student.image,
      status: b.status,
      attendance: b.attendance,
      creditsSpent: b.creditsSpent,
      familyBookingGroupId: b.familyBookingGroupId,
      focus: focusByStudent.get(b.student.id)!,
    });
  }

  // Soonest first: what is coming up leads, then the recent past, newest first.
  const all = Array.from(groups.values());
  const now = Date.now();
  const upcoming = all.filter((g) => g.scheduledAt.getTime() >= now).sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  const past = all.filter((g) => g.scheduledAt.getTime() < now).sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime());
  return [...upcoming, ...past];
}

/**
 * Marks attendance and finalizes the booking as COMPLETED, Present and
 * No-show both keep the already-spent credit (there's no Discord
 * integration here, so this roster is the sole source of truth for who
 * actually used their credits; a no-show is a forfeit, not a refund).
 */
/**
 * Marks attendance and finalizes the booking as COMPLETED, and, the first
 * time this runs for a given booking, this is also where the credit charge
 * actually happens. By direct instruction, a student is charged based on
 * whether the admin checks them present or absent, not at booking time,
 * booking only *reserves* the credits (see getEffectiveClassCredits), and a
 * no-show is charged exactly the same as an attendance, per the terms
 * students agree to.
 *
 * Guarded against double-charging: this is also how an admin corrects a
 * mis-click (Present when they meant No-show, or back), which re-enters
 * here with the booking already COMPLETED, the second call only updates
 * `attendance`, since the one real charge already landed on the first.
 */
export async function markAttendance(bookingId: string, attendance: AttendanceStatus): Promise<void> {
  const booking = await prisma.classBooking.findUniqueOrThrow({ where: { id: bookingId } });
  if (booking.status === "CANCELED") throw new ClassBookingError("Can't mark attendance for a canceled booking.");

  // The charge is claimed atomically: only the one request that flips the booking
  // from SCHEDULED to COMPLETED charges. Reading the status first and charging after
  // let two quick clicks both see SCHEDULED and both charge.
  const charged = await prisma.$transaction(async (tx) => {
    const claimed = await tx.classBooking.updateMany({
      where: { id: bookingId, status: "SCHEDULED" },
      data: { attendance, status: "COMPLETED" },
    });
    if (claimed.count === 1) {
      await tx.user.update({ where: { id: booking.studentId }, data: { classCredits: { decrement: booking.creditsSpent } } });
      return true;
    }
    // Already completed (a correction, or the other click won): only the mark changes.
    await tx.classBooking.updateMany({ where: { id: bookingId, status: "COMPLETED" }, data: { attendance } });
    return false;
  });
  // Best-effort ledger draw-down, outside the transaction above on purpose
  // (see drawDownCredits's own comment), the real charge already landed
  // unconditionally, this just keeps CreditGrant's bookkeeping roughly in
  // sync with it. Skipped entirely on a re-mark (already charged): the one
  // real charge, and the one real draw-down, both already happened on the
  // first call.
  if (charged) {
    await drawDownCredits(booking.studentId, booking.creditsSpent);
    await noticeAttendanceRecorded({ studentId: booking.studentId, present: attendance === "PRESENT", scheduledAt: booking.scheduledAt, storedCredits: booking.creditsSpent });
  }
}

/**
 * Fully reverses a mistaken attendance mark, not just correcting Present
 * vs. No-show (markAttendance's own re-mark path already handles that,
 * with no credit change either way, since both charge identically), but
 * undoing the charge itself: back to SCHEDULED, attendance cleared, and
 * the credit actually refunded. By direct instruction, after "this costs
 * real credits, I want it to be reversible", marking attendance was a
 * one-way door before this, with no way back from a wrong call short of a
 * manual admin credit adjustment on the separate Credits page.
 *
 * Only valid from COMPLETED, nothing to undo from any other status. The
 * refund records a fresh, non-expiring CreditGrant (same ADMIN_ADJUSTMENT
 * source and "never expires" shape adjustUserCredits' own positive-amount
 * path already uses) rather than trying to resurrect whatever grant the
 * original charge drew down from, which drawDownCredits doesn't track
 * precisely enough to reverse, same "best-effort ledger, not a perfect
 * mirror of the real balance" trade-off creditLedger.ts's own file header
 * already documents.
 */
export async function undoAttendance(bookingId: string): Promise<void> {
  const booking = await prisma.classBooking.findUniqueOrThrow({ where: { id: bookingId } });
  if (booking.status !== "COMPLETED") {
    throw new ClassBookingError("This booking isn't marked yet. Nothing to undo.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.classBooking.update({ where: { id: bookingId }, data: { status: "SCHEDULED", attendance: null } });
    await tx.user.update({ where: { id: booking.studentId }, data: { classCredits: { increment: booking.creditsSpent } } });
  });
  await recordCreditGrant(booking.studentId, booking.creditsSpent, { source: "ADMIN_ADJUSTMENT", expiresAt: null });

  await createNotification({
    userId: booking.studentId,
    type: "CREDIT_ADJUSTED",
    title: `${creditsLabelFromStored(booking.creditsSpent)} refunded`,
    body: "An admin corrected an attendance mark on your account. This class is back on your schedule and the credit was refunded.",
    emailCategory: "payments",
  }).catch((err) => console.error(`Failed to notify user ${booking.studentId} of attendance-undo refund (non-blocking):`, err));
}

/**
 * Admin-initiated cancel, unlike the student's self-serve cancelClassBooking,
 * this has no cutoff (an admin can free a slot or fix a mistake any
 * time before the class happens). No credit mutation, same reasoning as
 * cancelClassBooking: the real charge waits for markAttendance, so a
 * booking that's still SCHEDULED was never actually charged in the first
 * place, there's nothing to refund.
 */
export async function adminCancelClassBooking(bookingId: string, reason?: string): Promise<void> {
  const booking = await prisma.classBooking.findUniqueOrThrow({ where: { id: bookingId } });
  if (booking.status !== "SCHEDULED") throw new ClassBookingError("This booking isn't active.");

  const trimmedReason = reason?.trim() || null;

  await prisma.classBooking.update({
    where: { id: bookingId },
    // Always a reason, so a weekly-slot job never brings a class the studio canceled back.
    data: { status: "CANCELED", refunded: true, canceledReason: trimmedReason ?? "Canceled by the studio" },
  });

  await createNotification({
    userId: booking.studentId,
    type: "LESSON_BOOKING_CANCELED",
    title: "Class canceled",
    body: trimmedReason
      ? `Your ${formatEtDateTime(booking.scheduledAt)} class was canceled by the studio (${trimmedReason}). No credits were charged.`
      : `Your ${formatEtDateTime(booking.scheduledAt)} class was canceled by the studio. No credits were charged.`,
    emailCategory: "social",
  });
}


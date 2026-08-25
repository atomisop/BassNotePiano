import type { AttendanceStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { assertRateLimit, RateLimitError } from "@/lib/rateLimit";

export class ClassBookingError extends Error {}

export const CLASS_CAPACITY = 10;
export const CANCELLATION_CUTOFF_HOURS = 24;
// How many upcoming weeks of each weekly slot to surface as bookable —
// a fixed planning horizon rather than an unbounded "forever" list, since
// the schedule itself repeats indefinitely.
const OCCURRENCES_PER_SLOT = 4;
const ET_ZONE = "America/New_York";

// ---------------------------------------------------------------------------
// ET wall-clock <-> UTC conversion
//
// The weekly schedule is authored in ET wall-clock time (e.g. "Monday
// 11:00") and must resolve to the correct UTC instant on any given date,
// correctly crossing DST (EST is UTC-5, EDT is UTC-4) — a fixed offset
// would be wrong for roughly half the year. No date library needed: this
// uses the standard Intl.DateTimeFormat round-trip trick, which is exact
// for a fixed IANA zone like America/New_York.
// ---------------------------------------------------------------------------

function getEtOffsetMinutes(utcInstant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET_ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(utcInstant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const hour = get("hour") % 24; // some engines report midnight as "24"
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return (asUtc - utcInstant.getTime()) / 60_000;
}

/** Converts an ET wall-clock date+time to the UTC instant it represents. */
export function etWallTimeToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offsetMinutes = getEtOffsetMinutes(guess); // negative for ET (e.g. -300 EST, -240 EDT)
  return new Date(guess.getTime() - offsetMinutes * 60_000);
}

/** Today's calendar date as seen in ET, regardless of the server's own timezone. */
function todayInEt(): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function parseStartTime(startTime: string): { hour: number; minute: number } {
  const [hour, minute] = startTime.split(":").map(Number);
  return { hour, minute };
}

// ---------------------------------------------------------------------------
// Occurrence derivation — a specific week's instance of a recurring slot,
// identified by (scheduleId, occurrenceDate). occurrenceDate is stored as
// UTC midnight of the ET calendar date; it's a grouping/uniqueness key, not
// a real instant — scheduledAt is the real instant.
// ---------------------------------------------------------------------------

export interface ClassOccurrence {
  scheduleId: string;
  label: string | null;
  dayOfWeek: number;
  durationMin: number;
  creditCost: number;
  occurrenceDate: Date;
  scheduledAt: Date;
  seatsBooked: number;
  seatsLeft: number;
  isFull: boolean;
}

/** Every active weekly slot's next OCCURRENCES_PER_SLOT bookable occurrences, with live seat counts. */
export async function getUpcomingOccurrences(): Promise<ClassOccurrence[]> {
  const schedules = await prisma.classSchedule.findMany({ where: { active: true }, orderBy: { dayOfWeek: "asc" } });
  if (schedules.length === 0) return [];

  const { year, month, day } = todayInEt();
  const todayUtcMidnight = Date.UTC(year, month - 1, day);
  const now = Date.now();

  const candidates: { schedule: (typeof schedules)[number]; occurrenceDate: Date; scheduledAt: Date }[] = [];

  for (const schedule of schedules) {
    const { hour, minute } = parseStartTime(schedule.startTime);
    let found = 0;
    // 8 weeks is comfortably more than enough to find OCCURRENCES_PER_SLOT
    // matches for any weekday; this is just a safety bound, not a real limit.
    for (let offsetDays = 0; offsetDays < 56 && found < OCCURRENCES_PER_SLOT; offsetDays++) {
      const candidateUtcMidnight = todayUtcMidnight + offsetDays * 86_400_000;
      const candidateDate = new Date(candidateUtcMidnight);
      if (candidateDate.getUTCDay() !== schedule.dayOfWeek) continue;

      const scheduledAt = etWallTimeToUtc(
        candidateDate.getUTCFullYear(),
        candidateDate.getUTCMonth() + 1,
        candidateDate.getUTCDate(),
        hour,
        minute,
      );
      if (scheduledAt.getTime() <= now) continue; // today's slot already started/passed

      candidates.push({ schedule, occurrenceDate: candidateDate, scheduledAt });
      found++;
    }
  }

  // One grouped count query instead of one-per-candidate.
  const seatCounts = await prisma.classBooking.groupBy({
    by: ["scheduleId", "occurrenceDate"],
    where: {
      status: "SCHEDULED",
      OR: candidates.map((c) => ({ scheduleId: c.schedule.id, occurrenceDate: c.occurrenceDate })),
    },
    _count: { _all: true },
  });
  const seatsByKey = new Map(seatCounts.map((s) => [`${s.scheduleId}:${s.occurrenceDate.getTime()}`, s._count._all]));

  return candidates
    .map((c): ClassOccurrence => {
      const seatsBooked = seatsByKey.get(`${c.schedule.id}:${c.occurrenceDate.getTime()}`) ?? 0;
      return {
        scheduleId: c.schedule.id,
        label: c.schedule.label,
        dayOfWeek: c.schedule.dayOfWeek,
        durationMin: c.schedule.durationMin,
        creditCost: c.schedule.creditCost,
        occurrenceDate: c.occurrenceDate,
        scheduledAt: c.scheduledAt,
        seatsBooked,
        seatsLeft: Math.max(0, CLASS_CAPACITY - seatsBooked),
        isFull: seatsBooked >= CLASS_CAPACITY,
      };
    })
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

/**
 * Books a specific occurrence: verifies it's still in the future, spends
 * the schedule's credit cost, and enforces the 10-seat cap — all inside one
 * Serializable transaction so two students racing for the last seat can't
 * both succeed (Postgres aborts the loser with a serialization failure,
 * surfaced here as a friendly "just filled up" error rather than a crash).
 */
export async function bookClass(studentId: string, scheduleId: string, occurrenceDateMs: number) {
  const schedule = await prisma.classSchedule.findUniqueOrThrow({ where: { id: scheduleId } });
  if (!schedule.active) throw new ClassBookingError("This class is no longer offered.");

  const occurrenceDate = new Date(occurrenceDateMs);
  const { hour, minute } = parseStartTime(schedule.startTime);
  const scheduledAt = etWallTimeToUtc(
    occurrenceDate.getUTCFullYear(),
    occurrenceDate.getUTCMonth() + 1,
    occurrenceDate.getUTCDate(),
    hour,
    minute,
  );
  if (scheduledAt.getTime() <= Date.now()) {
    throw new ClassBookingError("That class has already started or passed.");
  }

  // STEP 20: a real student booking their week's classes might reasonably
  // book several in a row — 20/hour covers that comfortably while still
  // stopping a scripted attempt to hammer capacity/credit checks.
  await assertRateLimit(
    prisma.classBooking.count,
    { studentId },
    { windowMinutes: 60, max: 20, message: "You're booking too fast — please wait a bit and try again." },
  );

  try {
    return await prisma.$transaction(
      async (tx) => {
        const seatsBooked = await tx.classBooking.count({ where: { scheduleId, occurrenceDate, status: "SCHEDULED" } });
        if (seatsBooked >= CLASS_CAPACITY) throw new ClassBookingError("This class just filled up — pick another time.");

        // (studentId, scheduleId, occurrenceDate) is unique, so a student who
        // previously booked this exact occurrence and then canceled already
        // has a row here — CANCELED, not absent. A plain create() would hit
        // that unique constraint and fail with a confusing "already booked"
        // error even though the booking is inactive. Reuse that row (flip it
        // back to SCHEDULED) instead of inserting a second one; only a
        // genuinely still-SCHEDULED existing row should block a rebook.
        const existing = await tx.classBooking.findUnique({
          where: { studentId_scheduleId_occurrenceDate: { studentId, scheduleId, occurrenceDate } },
        });
        if (existing?.status === "SCHEDULED") {
          throw new ClassBookingError("You've already booked this class.");
        }

        const spent = await tx.user.updateMany({
          where: { id: studentId, classCredits: { gte: schedule.creditCost } },
          data: { classCredits: { decrement: schedule.creditCost } },
        });
        if (spent.count === 0) {
          throw new ClassBookingError(`You need ${schedule.creditCost} credits for this class.`);
        }

        if (existing) {
          return tx.classBooking.update({
            where: { id: existing.id },
            data: {
              status: "SCHEDULED",
              scheduledAt,
              creditsSpent: schedule.creditCost,
              attendance: null,
              refunded: false,
              canceledReason: null,
            },
          });
        }

        return tx.classBooking.create({
          data: { studentId, scheduleId, occurrenceDate, scheduledAt, creditsSpent: schedule.creditCost },
        });
      },
      { isolationLevel: "Serializable" },
    );
  } catch (err) {
    if (err instanceof ClassBookingError) throw err;
    if ((err as Prisma.PrismaClientKnownRequestError)?.code === "P2002") {
      throw new ClassBookingError("You've already booked this class.");
    }
    if ((err as Prisma.PrismaClientKnownRequestError)?.code === "P2034") {
      throw new ClassBookingError("That seat was just taken — try again.");
    }
    throw err;
  }
}

export interface BundleBookingSelection {
  scheduleId: string;
  occurrenceDateMs: number;
}

export interface BundleBookingResult extends BundleBookingSelection {
  ok: boolean;
  bookingId: string | null;
  error: string | null;
}

/**
 * Bundle booking: one submit for several occurrences at once (e.g. three
 * classes with the same teacher in one go), instead of repeating the whole
 * single-booking round trip per class. Deliberately NOT one shared
 * transaction across every selection — each occurrence has its own
 * capacity and its own failure mode (already full, already booked, not
 * enough credits *at that point in the loop*), and failing selection #3
 * because someone else took the last seat shouldn't undo #1 and #2, which
 * genuinely succeeded. Every selection goes through the exact same
 * `bookClass` a single booking does — same Serializable transaction, same
 * capacity/credit/de-dupe checks, same rate limit (counted per class
 * booked, same as if they'd been submitted one at a time) — this just
 * loops it and reports one outcome per selection instead of one for the
 * whole batch.
 *
 * Duplicate selections (the same occurrence picked twice, e.g. a
 * double-click race) collapse to a single attempt — `bookClass` itself
 * would just report the second as "already booked" otherwise, which reads
 * like a real failure for something that was never a real second request.
 */
export async function bookClassBundle(studentId: string, selections: BundleBookingSelection[]): Promise<BundleBookingResult[]> {
  const seen = new Set<string>();
  const deduped = selections.filter((s) => {
    const key = `${s.scheduleId}:${s.occurrenceDateMs}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const results: BundleBookingResult[] = [];
  for (const selection of deduped) {
    try {
      const booking = await bookClass(studentId, selection.scheduleId, selection.occurrenceDateMs);
      results.push({ ...selection, ok: true, bookingId: booking.id, error: null });
    } catch (err) {
      results.push({
        ...selection,
        ok: false,
        bookingId: null,
        error: err instanceof ClassBookingError || err instanceof RateLimitError ? err.message : "Something went wrong.",
      });
    }
  }
  return results;
}

export async function getClassCreditBalance(userId: string): Promise<number> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { classCredits: true } });
  return user.classCredits;
}

/** Called from approveZellePayment once a CLASS_CREDITS payment verifies.
 *  `db` defaults to the plain client but accepts a transaction client — see
 *  the STEP 19 comment on unlockScaleForUser/grantCurriculumAccess in
 *  access.ts for why. */
export async function addClassCredits(
  userId: string,
  quantity: number,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { classCredits: { increment: quantity } } });
}

export async function getUserClassBookings(studentId: string) {
  return prisma.classBooking.findMany({
    where: { studentId },
    include: { schedule: true },
    orderBy: { scheduledAt: "desc" },
  });
}

/**
 * Self-serve cancellation — >=24h before the class start only. Always
 * refunds the spent credits and frees the seat (there's no other outcome:
 * self-cancel simply isn't offered once inside the window). A student who
 * needs to cancel inside 24h has to message support instead; any refund at
 * that point is a manual, discretionary admin credit adjustment, not
 * something this function grants automatically.
 */
export async function cancelClassBooking(bookingId: string, studentId: string): Promise<{ refunded: true }> {
  const booking = await prisma.classBooking.findUniqueOrThrow({ where: { id: bookingId } });
  if (booking.studentId !== studentId) throw new ClassBookingError("Not your booking.");
  if (booking.status !== "SCHEDULED") throw new ClassBookingError("This booking isn't active.");

  const hoursUntil = (booking.scheduledAt.getTime() - Date.now()) / 3_600_000;
  if (hoursUntil < CANCELLATION_CUTOFF_HOURS) {
    throw new ClassBookingError(
      `Too close to class time to cancel yourself (inside ${CANCELLATION_CUTOFF_HOURS} hours) — message us and we'll help.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.classBooking.update({ where: { id: bookingId }, data: { status: "CANCELED", refunded: true } });
    await tx.user.update({ where: { id: studentId }, data: { classCredits: { increment: booking.creditsSpent } } });
  });

  await createNotification({
    userId: studentId,
    type: "LESSON_BOOKING_CANCELED",
    title: "Class canceled",
    body: `Your ${booking.scheduledAt.toLocaleString()} class was canceled and ${booking.creditsSpent} credit${booking.creditsSpent === 1 ? "" : "s"} were refunded.`,
    emailCategory: "social",
  });

  return { refunded: true };
}

// ---------------------------------------------------------------------------
// Admin: roster + attendance
// ---------------------------------------------------------------------------

export interface AdminOccurrenceRosterEntry {
  bookingId: string;
  studentId: string;
  studentName: string | null;
  studentEmail: string;
  studentImage: string | null;
  status: "SCHEDULED" | "CANCELED" | "COMPLETED";
  attendance: AttendanceStatus | null;
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

  const groups = new Map<string, AdminOccurrenceGroup>();
  for (const b of bookings) {
    const key = `${b.scheduleId}:${b.occurrenceDate.getTime()}`;
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
    });
  }

  return Array.from(groups.values());
}

/**
 * Marks attendance and finalizes the booking as COMPLETED — Present and
 * No-show both keep the already-spent credit (there's no Discord
 * integration here, so this roster is the sole source of truth for who
 * actually used their credits; a no-show is a forfeit, not a refund).
 */
export async function markAttendance(bookingId: string, attendance: AttendanceStatus): Promise<void> {
  const booking = await prisma.classBooking.findUniqueOrThrow({ where: { id: bookingId } });
  if (booking.status === "CANCELED") throw new ClassBookingError("Can't mark attendance for a canceled booking.");
  await prisma.classBooking.update({ where: { id: bookingId }, data: { attendance, status: "COMPLETED" } });
}

/**
 * Admin-initiated cancel — unlike the student's self-serve cancelClassBooking,
 * this has no 24-hour cutoff (an admin can free a seat or fix a mistake any
 * time before the class happens) and always refunds the credit, since a
 * human made the call here rather than the strict self-serve rule. This is
 * the "manual, case-by-case" refund path the terms page points students to
 * support for.
 */
export async function adminCancelClassBooking(bookingId: string, reason?: string): Promise<void> {
  const booking = await prisma.classBooking.findUniqueOrThrow({ where: { id: bookingId } });
  if (booking.status !== "SCHEDULED") throw new ClassBookingError("This booking isn't active.");

  const trimmedReason = reason?.trim() || null;

  await prisma.$transaction(async (tx) => {
    await tx.classBooking.update({
      where: { id: bookingId },
      data: { status: "CANCELED", refunded: true, canceledReason: trimmedReason },
    });
    await tx.user.update({ where: { id: booking.studentId }, data: { classCredits: { increment: booking.creditsSpent } } });
  });

  await createNotification({
    userId: booking.studentId,
    type: "LESSON_BOOKING_CANCELED",
    title: "Class canceled",
    body: trimmedReason
      ? `Your ${booking.scheduledAt.toLocaleString()} class was canceled by the studio (${trimmedReason}) and ${booking.creditsSpent} credit${booking.creditsSpent === 1 ? "" : "s"} were refunded.`
      : `Your ${booking.scheduledAt.toLocaleString()} class was canceled by the studio and ${booking.creditsSpent} credit${booking.creditsSpent === 1 ? "" : "s"} were refunded.`,
    emailCategory: "social",
  });
}

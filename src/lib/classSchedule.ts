import { noticeBookingConfirmed } from "@/lib/studentNotices";
import { getAdminRecipients } from "@/lib/adminNotifications";
import { addMinutesToHHmm, formatEtDateTime } from "@/lib/classScheduleLabels";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { assertRateLimit, RateLimitError } from "@/lib/rateLimit";
import { PLAN_CADENCE_CREDITS_PER_WEEK, CLASS_MINUTES, CREDITS_PER_CLASS, creditsLabelFromStored } from "@/lib/classCreditPricing";
import { SUBSCRIBER_CLASSES_PER_WEEK, weekRangeForOccurrence } from "@/lib/bookingRules";
import { getBoolSetting, getNumberSetting, getTextSetting } from "@/lib/siteSettings";

export class ClassBookingError extends Error {}

// Three tiers, by direct instruction:
//  - Solo (1:1): one student books an occurrence alone, 1-2 credits (up to
//    an hour) of their own choosing, at their own pace. The default now,
//    the whole reason the other two tiers below exist as *separate* things
//    rather than every booking flowing through one shared path.
//  - Family: 2+ named, verified accounts sharing one occurrence, always at
//    the full FAMILY_CREDITS_PER_STUDENT rate each, since teaching several
//    kids at once is genuinely more work than one regardless of how long
//    any single kid stays.
//  - Group: up to GROUP_CAPACITY strangers sharing one occurrence at the
//    fixed GROUP_CREDITS_PER_STUDENT rate, no early leaving. Not built yet,
//    these constants exist now so the eventual group-booking function
//    has its numbers already agreed on, not so anything reads them today.
export const SOLO_MAX_CREDITS = 2;
export const FAMILY_MIN_ATTENDEES = 2;
export const FAMILY_CREDITS_PER_STUDENT = 2;
export const GROUP_CAPACITY = 10;
export const GROUP_CREDITS_PER_STUDENT = 2;

export const CANCELLATION_CUTOFF_HOURS = 6;
// How many upcoming weeks of each weekly slot to surface as bookable,
// a fixed planning horizon rather than an unbounded "forever" list, since
// the schedule itself repeats indefinitely. Exported: the reservation-
// maintenance job (netlify/functions/payment-plan-reservations.ts) keeps
// this exact same rolling window auto-booked for a Payment Plan's reserved
// slot, not just "next week", the same horizon a student sees, kept
// actually booked rather than just displayed.
//
// Raised from 4 to 8 weeks (one month to two) by direct instruction, a
// student planning around work/school travel couldn't book more than four
// weeks out, and a Payment Plan subscriber's own reservation window was
// exactly as short, both real friction for anyone trying to lock in a
// schedule further ahead than that.
export const OCCURRENCES_PER_SLOT = 8;
const ET_ZONE = "America/New_York";

// ---------------------------------------------------------------------------
// ET wall-clock <-> UTC conversion
//
// The weekly schedule is authored in ET wall-clock time (e.g. "Monday
// 11:00") and must resolve to the correct UTC instant on any given date,
// correctly crossing DST (EST is UTC-5, EDT is UTC-4), a fixed offset
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

/**
 * The admin's booking switches (Settings → Booking), checked for a student making
 * their own booking. An admin booking on a student's behalf skips these.
 */
async function assertBookingAllowed(scheduledAt: Date, opts: { family?: boolean } = {}): Promise<void> {
  if (await getBoolSetting("booking.paused")) throw new ClassBookingError(await getTextSetting("booking.pausedMessage"));
  if (opts.family && !(await getBoolSetting("booking.allowFamily"))) throw new ClassBookingError("Family bookings are not available right now.");
  const minNoticeHours = await getNumberSetting("booking.minNoticeHours");
  if (minNoticeHours > 0 && scheduledAt.getTime() - Date.now() < minNoticeHours * 3_600_000) {
    throw new ClassBookingError(`Classes need to be booked at least ${minNoticeHours} hour${minNoticeHours === 1 ? "" : "s"} ahead.`);
  }
  if (!(await getBoolSetting("booking.allowSameDay")) && scheduledAt.getTime() < todayBoundsEt().end.getTime()) {
    throw new ClassBookingError("Same-day booking is turned off. Please pick a class on a later day.");
  }
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

/** Today in ET as a [start, end) pair of UTC instants. */
export function todayBoundsEt(): { start: Date; end: Date } {
  const { year, month, day } = todayInEt();
  return { start: etWallTimeToUtc(year, month, day, 0, 0), end: etWallTimeToUtc(year, month, day + 1, 0, 0) };
}

/** The instant this week ends: next Monday 00:00 in ET. The admin Attendance icon only lists classes before it, so it rolls to the new week on its own. */
export function endOfThisWeekEt(): Date {
  const { year, month, day } = todayInEt();
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
  const daysUntilMonday = ((8 - weekday) % 7) || 7;
  return etWallTimeToUtc(year, month, day + daysUntilMonday, 0, 0);
}

function parseStartTime(startTime: string): { hour: number; minute: number } {
  const [hour, minute] = startTime.split(":").map(Number);
  return { hour, minute };
}

// ---------------------------------------------------------------------------
// Occurrence derivation, a specific week's instance of a recurring slot,
// identified by (scheduleId, occurrenceDate). occurrenceDate is stored as
// UTC midnight of the ET calendar date; it's a grouping/uniqueness key, not
// a real instant, scheduledAt is the real instant.
// ---------------------------------------------------------------------------

// A window longer than one appointment (e.g. an admin-defined "11am-1pm"
// block) doesn't become one all-or-nothing occurrence, it splits into
// independent CHUNK_MIN-sized appointment slots (11:00 and 12:00), each its
// own booking party. Taking the 11:00 slot no longer blocks 12:00 the way a
// single-occurrence-per-window model would; only whichever exact start time
// was actually claimed is unavailable. CHUNK_MIN matches both
// SOLO_MAX_CREDITS and FAMILY_CREDITS_PER_STUDENT (60 min = 2 credits) since
// every booking, solo or family, is already capped at that same length.
const CHUNK_MIN = SOLO_MAX_CREDITS * 30;

interface ScheduleChunk {
  chunkIndex: number;
  /** Minutes past the schedule's own startTime this chunk begins. */
  offsetMin: number;
  /** This chunk's own max credits, CHUNK_MIN's worth, or whatever's left in a window that doesn't divide evenly. */
  creditCost: number;
}

export function chunksForSchedule(schedule: { durationMin: number }): ScheduleChunk[] {
  const chunks: ScheduleChunk[] = [];
  for (let offsetMin = 0; offsetMin < schedule.durationMin; offsetMin += CHUNK_MIN) {
    const remainingMin = schedule.durationMin - offsetMin;
    // A slot starts every CHUNK_MIN (the hour) and holds one class of
    // CLASS_MINUTES. Whatever is left at the end of a window that cannot fit a
    // whole class (say the last 30 minutes of a 90-minute window) is not offered.
    if (remainingMin < CLASS_MINUTES) continue;
    chunks.push({ chunkIndex: chunks.length, offsetMin, creditCost: CREDITS_PER_CLASS });
  }
  return chunks;
}

export interface ClassOccurrence {
  scheduleId: string;
  label: string | null;
  dayOfWeek: number;
  /** Which CHUNK_MIN-sized appointment slot within the schedule's own window this is, see chunksForSchedule. */
  chunkIndex: number;
  durationMin: number;
  /** This chunk's own credit ceiling, not the whole window's. */
  creditCost: number;
  occurrenceDate: Date;
  scheduledAt: Date;
  /** One booking party per chunk, solo or family, either way this exact
      start time is gone once anyone has claimed it. A different chunk of
      the same window (a different start time) is unaffected. */
  isBooked: boolean;
}

/**
 * The next `count` calendar dates (ET, stored as UTC midnight) that fall on
 * `dayOfWeek`, starting from today, the date-walking half of
 * getUpcomingOccurrences's own loop, factored out so the reservation-
 * maintenance job (payment-plan-reservations.ts) can walk one specific
 * schedule's dayOfWeek the exact same way, without a second copy of this
 * logic. Deliberately time-of-day-agnostic (that's chunksForSchedule's
 * concern), this only matches calendar dates, and always returns up to
 * `count` of them regardless of whether the earliest ones are already in
 * the past today (see this function's only caller below for why that's
 * correct: the actual "already passed" filtering happens per-chunk, not
 * per-date).
 */
export function nextOccurrenceDates(dayOfWeek: number, count: number): Date[] {
  const { year, month, day } = todayInEt();
  const todayUtcMidnight = Date.UTC(year, month - 1, day);

  const dates: Date[] = [];
  // 8 weeks is comfortably more than enough to find `count` matches for any
  // weekday; this is just a safety bound, not a real limit.
  for (let offsetDays = 0; offsetDays < 56 && dates.length < count; offsetDays++) {
    const candidateDate = new Date(todayUtcMidnight + offsetDays * 86_400_000);
    if (candidateDate.getUTCDay() !== dayOfWeek) continue;
    dates.push(candidateDate);
  }
  return dates;
}

/**
 * The real UTC instant a specific chunk of a schedule starts on a specific
 * occurrence date, the same etWallTimeToUtc + chunk.offsetMin computation
 * bookClass/bookFamilyClass/getUpcomingOccurrences each already do inline,
 * factored out here so the reservation-maintenance job
 * (payment-plan-reservations.ts) can compute it for a plan's own reserved
 * chunk without a second copy of the logic.
 */
export function computeScheduledAt(schedule: { startTime: string }, occurrenceDate: Date, chunk: ScheduleChunk): Date {
  const { hour, minute } = parseStartTime(schedule.startTime);
  return new Date(
    etWallTimeToUtc(occurrenceDate.getUTCFullYear(), occurrenceDate.getUTCMonth() + 1, occurrenceDate.getUTCDate(), hour, minute).getTime() +
      chunk.offsetMin * 60_000,
  );
}

/**
 * How many classes a weekly slot holds between two moments: every date with this weekday whose class starts at or after
 * `from` and before `until`. A paid month of 28 to 31 days holds four or five of any weekday, depending on where it starts.
 * The dates are UTC-midnight stand-ins for ET calendar days, like everywhere else in this file.
 */
export function classesInWindow(schedule: { dayOfWeek: number; startTime: string }, chunk: ScheduleChunk, from: Date, until: Date): number {
  return classStartsInWindow(schedule, chunk, from, until).length;
}

/** The start time of every class a weekly slot holds between two moments (see classesInWindow). */
export function classStartsInWindow(schedule: { dayOfWeek: number; startTime: string }, chunk: ScheduleChunk, from: Date, until: Date): Date[] {
  return classOccurrencesInWindow(schedule, chunk, from, until).map((o) => o.scheduledAt);
}

/** Like classStartsInWindow, with each class's occurrence date (the UTC-midnight stand-in for its ET day) too. */
export function classOccurrencesInWindow(schedule: { dayOfWeek: number; startTime: string }, chunk: ScheduleChunk, from: Date, until: Date): { occurrenceDate: Date; scheduledAt: Date }[] {
  const starts: { occurrenceDate: Date; scheduledAt: Date }[] = [];
  const first = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()) - 86_400_000;
  const last = until.getTime() + 86_400_000;
  for (let t = first; t <= last; t += 86_400_000) {
    const date = new Date(t);
    if (date.getUTCDay() !== schedule.dayOfWeek) continue;
    const at = computeScheduledAt(schedule, date, chunk).getTime();
    if (at >= from.getTime() && at < until.getTime()) starts.push({ occurrenceDate: date, scheduledAt: new Date(at) });
  }
  return starts;
}

/** Every active weekly slot's next OCCURRENCES_PER_SLOT bookable chunks, with live availability. */
export async function getUpcomingOccurrences(): Promise<ClassOccurrence[]> {
  const schedules = await prisma.classSchedule.findMany({ where: { active: true }, orderBy: { dayOfWeek: "asc" } });
  if (schedules.length === 0) return [];

  const now = Date.now();
  const horizonWeeks = await getNumberSetting("booking.horizonWeeks");

  const candidates: {
    schedule: (typeof schedules)[number];
    chunk: ScheduleChunk;
    occurrenceDate: Date;
    scheduledAt: Date;
  }[] = [];

  for (const schedule of schedules) {
    const { hour, minute } = parseStartTime(schedule.startTime);
    const chunks = chunksForSchedule(schedule);

    for (const candidateDate of nextOccurrenceDates(schedule.dayOfWeek, horizonWeeks)) {
      const baseScheduledAt = etWallTimeToUtc(
        candidateDate.getUTCFullYear(),
        candidateDate.getUTCMonth() + 1,
        candidateDate.getUTCDate(),
        hour,
        minute,
      );

      for (const chunk of chunks) {
        const scheduledAt = new Date(baseScheduledAt.getTime() + chunk.offsetMin * 60_000);
        if (scheduledAt.getTime() <= now) continue; // this chunk already started/passed today
        candidates.push({ schedule, chunk, occurrenceDate: candidateDate, scheduledAt });
      }
    }
  }

  // One grouped count query instead of one-per-candidate, grouped by the
  // exact instant, not just the day, since that's what actually identifies
  // one chunk now. Any count > 0 means that specific chunk's one booking
  // party (solo or family) is claimed; a sibling chunk in the same window
  // is a different scheduledAt and unaffected.
  const bookedCounts = await prisma.classBooking.groupBy({
    by: ["scheduleId", "occurrenceDate", "scheduledAt"],
    where: {
      status: "SCHEDULED",
      OR: candidates.map((c) => ({ scheduleId: c.schedule.id, occurrenceDate: c.occurrenceDate, scheduledAt: c.scheduledAt })),
    },
    _count: { _all: true },
  });
  const bookedKeys = new Set(
    bookedCounts.filter((s) => s._count._all > 0).map((s) => `${s.scheduleId}:${s.occurrenceDate.getTime()}:${s.scheduledAt.getTime()}`),
  );

  return candidates
    .map(
      (c): ClassOccurrence => ({
        scheduleId: c.schedule.id,
        label: c.schedule.label,
        dayOfWeek: c.schedule.dayOfWeek,
        chunkIndex: c.chunk.chunkIndex,
        durationMin: CLASS_MINUTES,
        creditCost: c.chunk.creditCost,
        occurrenceDate: c.occurrenceDate,
        scheduledAt: c.scheduledAt,
        isBooked: bookedKeys.has(`${c.schedule.id}:${c.occurrenceDate.getTime()}:${c.scheduledAt.getTime()}`),
      }),
    )
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

/**
 * Matches a PaymentPlan whose weekly reservation (reservedScheduleId/
 * reservedChunkIndex) is still "live", ACTIVE, or COMPLETED with a
 * not-yet-expired CreditGrant against it. The COMPLETED-with-a-live-grant
 * case matters because a plan finishing its final paid installment
 * shouldn't instantly lose its exclusivity and auto-booking the moment that
 * last payment clears, the credits from that last cycle are still good and
 * the student is still using the slot. Shared by every reservation-
 * exclusivity check in this file (and by paymentPlans.ts's own enrollment-
 * time check), so "what counts as a live reservation" can't drift between
 * them.
 */
export function livePaymentPlanConditions(): Prisma.PaymentPlanWhereInput[] {
  return [{ status: "ACTIVE" }, { status: "COMPLETED", creditGrants: { some: { expiresAt: { gt: new Date() }, expiredAt: null } } }];
}

/**
 * A student's own credit balance minus whatever's already reserved by their
 * own SCHEDULED-but-not-yet-attended bookings. The real charge for any of
 * those doesn't land until markAttendance runs (see that function's own
 * comment for why), so User.classCredits alone would overstate what's
 * actually still free to spend, this is what every booking check and every
 * "your balance" display should read instead of the raw column.
 */
export async function getEffectiveClassCredits(userId: string): Promise<number> {
  const [user, pending] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { classCredits: true } }),
    prisma.classBooking.aggregate({ where: { studentId: userId, status: "SCHEDULED" }, _sum: { creditsSpent: true } }),
  ]);
  return user.classCredits - (pending._sum.creditsSpent ?? 0);
}

/**
 * One class a day, no exceptions for a different time or a different
 * class, by direct instruction. Keyed on `occurrenceDate` (the same ET
 * calendar-day identifier capacity/uniqueness already use elsewhere in this
 * file), not `scheduledAt`, since that's the actual day boundary a student
 * thinks in. `excludeScheduleId` lets a student re-book (or a family
 * booking re-claim) their own existing row on this exact schedule+day
 * without tripping over themselves, that's not a second class, it's the
 * same one. Runs inside the caller's own transaction so it's checked
 * against the same consistent snapshot as the rest of that booking attempt.
 */
async function assertNoOtherBookingSameDay(
  tx: Prisma.TransactionClient,
  studentId: string,
  occurrenceDate: Date,
  excludeScheduleId: string,
): Promise<void> {
  const otherBookingSameDay = await tx.classBooking.findFirst({
    where: { studentId, occurrenceDate, status: "SCHEDULED", NOT: { scheduleId: excludeScheduleId } },
    select: { id: true },
  });
  if (otherBookingSameDay) {
    throw new ClassBookingError("You can only book one class per day, message support if you need a second class on the same day.");
  }
}

/** True when the student has a payment plan that is still running, the same test the weekly limit uses. */
export async function hasLivePaymentPlan(userId: string): Promise<boolean> {
  const plan = await prisma.paymentPlan.findFirst({ where: { userId, OR: livePaymentPlanConditions() }, select: { id: true } });
  return Boolean(plan);
}

/**
 * Refuses a booking that would give a payment-plan subscriber a second class in
 * the same Sunday to Saturday week. `ignoreBookingId` is the class being moved
 * (a reschedule), `ignoreSlot` the exact schedule and day being re-booked by
 * its own row. Students without a live plan are not limited here.
 */
async function assertWithinSubscriberWeeklyLimit(
  tx: Prisma.TransactionClient,
  studentId: string,
  occurrenceDate: Date,
  ignore: { bookingId?: string; scheduleId?: string },
): Promise<void> {
  const plan = await tx.paymentPlan.findFirst({
    where: { userId: studentId, OR: livePaymentPlanConditions() },
    select: { id: true },
  });
  if (!plan) return;
  const { start, end } = weekRangeForOccurrence(occurrenceDate);
  const held = await tx.classBooking.count({
    where: {
      studentId,
      status: { in: ["SCHEDULED", "COMPLETED"] },
      occurrenceDate: { gte: start, lt: end },
      NOT: [
        ...(ignore.bookingId ? [{ id: ignore.bookingId }] : []),
        ...(ignore.scheduleId ? [{ scheduleId: ignore.scheduleId, occurrenceDate }] : []),
      ],
    },
  });
  if (held >= SUBSCRIBER_CLASSES_PER_WEEK) {
    throw new ClassBookingError(
      "You already have your class for that week. Your credits cover one class a week. You can add an extra session from the Extra sessions tab.",
    );
  }
}

/**
 * Books a specific occurrence for one student alone. Solo 1:1 is the
 * default tier now: every booking is one class of CLASS_MINUTES (45), which
 * costs CREDITS_PER_CLASS internal credits; `creditsToBook`, if passed, must
 * equal that.
 *
 * Capacity is binary, not counted: an occurrence is claimed by whichever
 * booking (solo or family) lands on it first, and everyone else is locked
 * out of that exact slot for that week, this is an appointment book, not a
 * shared classroom. Credits are reserved (checked against
 * getEffectiveClassCredits) but not actually deducted from the student's
 * balance yet; that happens once in markAttendance, whether they show up or
 * not. Both checks run inside one Serializable transaction so two students
 * racing for the same open slot can't both win it (Postgres aborts the
 * loser with a serialization failure, surfaced here as a friendly "just
 * booked" error rather than a crash).
 */
export async function bookClass(
  studentId: string,
  scheduleId: string,
  occurrenceDateMs: number,
  chunkIndex: number,
  creditsToBook?: number,
  options: { isAdminAssisted?: boolean } = {},
) {
  const schedule = await prisma.classSchedule.findUniqueOrThrow({ where: { id: scheduleId } });
  if (!schedule.active) throw new ClassBookingError("This class is no longer offered.");

  const chunk = chunksForSchedule(schedule)[chunkIndex];
  if (!chunk) throw new ClassBookingError("That time slot doesn't exist.");

  // A class is always one fixed size. Anything else (a half-priced, shorter
  // booking) is refused, so the price per class cannot be dodged.
  const credits = chunk.creditCost;
  if (creditsToBook !== undefined && creditsToBook !== credits) {
    throw new ClassBookingError("Classes are 45 minutes. Please book a full class.");
  }

  const occurrenceDate = new Date(occurrenceDateMs);
  const { hour, minute } = parseStartTime(schedule.startTime);
  const scheduledAt = new Date(
    etWallTimeToUtc(
      occurrenceDate.getUTCFullYear(),
      occurrenceDate.getUTCMonth() + 1,
      occurrenceDate.getUTCDate(),
      hour,
      minute,
    ).getTime() + chunk.offsetMin * 60_000,
  );
  if (scheduledAt.getTime() <= Date.now()) {
    throw new ClassBookingError("That class has already started or passed.");
  }
  if (!options.isAdminAssisted) await assertBookingAllowed(scheduledAt);
  // Payment Plan subscribers can book here too: their weekly class is
  // auto-booked and paid by the plan, and this is where they book EXTRA
  // sessions on top of it, with credits bought at $40 each (see
  // createExtraCreditsPayment). Everything below still applies: a real
  // occurrence, real capacity, a real credit balance, one class a day.
  // (isAdminAssisted now only skips the "a student booked a class" admin
  // notification further down, since an admin booking for a student already
  // knows.)

  // STEP 20: a real student booking their week's classes might reasonably
  // book several in a row, 20/hour covers that comfortably while still
  // stopping a scripted attempt to hammer capacity/credit checks.
  await assertRateLimit(
    prisma.classBooking.count,
    { studentId },
    { windowMinutes: 60, max: await getNumberSetting("booking.perHourLimit"), message: "You're booking too fast. Please wait a bit and try again." },
  );

  let booking;
  try {
    booking = await prisma.$transaction(
      async (tx) => {
        // Keyed on the exact instant, not just the day, a sibling chunk of
        // the same admin-defined window (a different start time) is a
        // separate appointment slot and shouldn't block this one.
        const takenByAnyone = await tx.classBooking.findFirst({ where: { scheduleId, occurrenceDate, scheduledAt, status: "SCHEDULED" } });
        if (takenByAnyone && takenByAnyone.studentId !== studentId) {
          throw new ClassBookingError("This time was just booked by someone else. Pick another slot.");
        }

        // Defense-in-depth against a Payment Plan's own reserved slot,
        // layer 3 of 3 (see livePaymentPlanConditions's own comment and
        // PaymentPlan.reservedScheduleId's schema comment). In the normal
        // case the daily reservation-maintenance job already makes this
        // slot show up as taken above, once its own ClassBooking rows
        // exist; this covers the gap between an enrollment and that job's
        // next run. The reservation holder booking their own slot is
        // allowed through, only a *different* student is blocked.
        const reservedByOtherPlan = await tx.paymentPlan.findFirst({
          where: { reservedScheduleId: scheduleId, reservedChunkIndex: chunkIndex, userId: { not: studentId }, OR: livePaymentPlanConditions() },
          select: { id: true },
        });
        if (reservedByOtherPlan) {
          throw new ClassBookingError("This time is reserved for another student's payment plan.");
        }

        // (studentId, scheduleId, occurrenceDate) is unique, so a student who
        // previously booked this exact occurrence and then canceled already
        // has a row here, CANCELED, not absent. A plain create() would hit
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

        // Skipped for an admin-assisted booking, same reasoning as the
        // active-plan guard above: an admin fixing a specific booking issue
        // directly is the judgment call this exists to require instead of
        // open self-service, not something it should also block.
        if (!options.isAdminAssisted) {
          await assertNoOtherBookingSameDay(tx, studentId, occurrenceDate, scheduleId);
          await assertWithinSubscriberWeeklyLimit(tx, studentId, occurrenceDate, { scheduleId });
        }

        const [user, pending] = await Promise.all([
          tx.user.findUniqueOrThrow({ where: { id: studentId }, select: { classCredits: true } }),
          tx.classBooking.aggregate({ where: { studentId, status: "SCHEDULED" }, _sum: { creditsSpent: true } }),
        ]);
        const available = user.classCredits - (pending._sum.creditsSpent ?? 0);
        if (available < credits) {
          throw new ClassBookingError(
            `You need ${creditsLabelFromStored(credits)} available. You have ${creditsLabelFromStored(available)} free right now.`,
          );
        }

        if (existing) {
          return tx.classBooking.update({
            where: { id: existing.id },
            data: {
              status: "SCHEDULED",
              scheduledAt,
              creditsSpent: credits,
              attendance: null,
              refunded: false,
              canceledReason: null,
              familyBookingGroupId: null,
            },
          });
        }

        return tx.classBooking.create({
          data: { studentId, scheduleId, occurrenceDate, scheduledAt, creditsSpent: credits },
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
      throw new ClassBookingError("That slot was just taken. Try again.");
    }
    throw err;
  }

  // LESSON_BOOKING_RECEIVED already existed as a defined notification type
  // (bell icon, admin CTA to /admin/bookings) but nothing ever actually
  // triggered it, the teacher had no way to find out a class had been
  // booked short of checking the roster themselves. Same pattern
  // classRegistration.ts already uses for new registrations: notify every
  // ADMIN (today, just the one account), non-blocking so a notification
  // hiccup never fails a real booking. Skipped when an admin made this
  // booking themselves (adminBookClass below), notifying the admin that
  // the admin just booked something is noise, not news.
  if (!options.isAdminAssisted) {
    (await getBoolSetting("booking.notifyAdminOnBooking") ? notifyAdminsOfBooking(studentId, schedule, scheduledAt, credits) : Promise.resolve()).catch((err) =>
      console.error("Admin booking notification failed (non-blocking):", err),
    );
  }
  // The student is told too: a booking confirmation, or that the studio booked it for them.
  await noticeBookingConfirmed({ studentId, scheduledAt, label: schedule.label, storedCredits: credits, byStudio: Boolean(options.isAdminAssisted) });

  return booking;
}

/**
 * Admin-assisted direct booking, the escape hatch for a student whose own
 * path is stuck: an active Payment Plan subscriber can no longer self-book
 * an ad hoc class at all (see bookClass's own guard above), so a one-off
 * scheduling problem (they're sick this week and want a different day, a
 * family situation needs a human, whatever it is) has nowhere for them to
 * go except contacting support, per the note already on their /lessons
 * page. This is that support action: an admin picks the student and the
 * exact open time, on the student's behalf, after hearing from them directly.
 *
 * Thin wrapper over bookClass with isAdminAssisted set, nothing else
 * changes: the occurrence still has to be real and open, and the student
 * still has to have a free credit to spend, same as any other booking.
 */
export async function adminBookClass(
  studentId: string,
  scheduleId: string,
  occurrenceDateMs: number,
  chunkIndex: number,
  creditsToBook?: number,
) {
  return bookClass(studentId, scheduleId, occurrenceDateMs, chunkIndex, creditsToBook, { isAdminAssisted: true });
}

async function notifyAdminsOfBooking(
  studentId: string,
  schedule: { label: string | null },
  scheduledAt: Date,
  creditsBooked: number,
) {
  const [student, admins] = await Promise.all([
    prisma.user.findUnique({ where: { id: studentId }, select: { name: true, email: true } }),
    getAdminRecipients("NEW_BOOKING"),
  ]);
  const studentLabel = student?.name ?? student?.email ?? "A student";
  const when = scheduledAt.toLocaleString("en-US", { timeZone: ET_ZONE, dateStyle: "full", timeStyle: "short" });
  const endsAt = new Date(scheduledAt.getTime() + (creditsBooked / CREDITS_PER_CLASS) * CLASS_MINUTES * 60_000).toLocaleTimeString("en-US", {
    timeZone: ET_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
  // Real labels already read as full names ("Wednesday class", "Monday
  // evening class"), appending "class" again produced "Wednesday class
  // class".
  const classLabel = schedule.label ?? "class";

  await Promise.all(
    admins.map((admin) =>
      createNotification({
        userId: admin.id,
        type: "LESSON_BOOKING_RECEIVED",
        title: "New one-on-one booking",
        body: `${studentLabel} booked the ${classLabel} ${when} to ${endsAt} (${creditsLabelFromStored(creditsBooked)}).`,
        emailCategory: "classes",
      }),
    ),
  );
}

/**
 * Tells the admins when a student cancels or moves a class on their own, with
 * their name and the times, so the teacher never finds out by an empty chair.
 * `to` present means a reschedule. Never throws: a notification hiccup must
 * not undo a real cancel or move.
 */
async function notifyAdminsOfSelfChange(
  studentId: string,
  change: { from: Date; to?: Date },
) {
  try {
    const [student, admins] = await Promise.all([
      prisma.user.findUnique({ where: { id: studentId }, select: { name: true, email: true } }),
      getAdminRecipients("NEW_BOOKING"),
    ]);
    const who = student?.name ?? student?.email ?? "A student";
    const title = change.to ? `${who} rescheduled a class` : `${who} canceled a class`;
    const body = change.to
      ? `${who} rescheduled from ${formatEtDateTime(change.from)} to ${formatEtDateTime(change.to)}.`
      : `${who} canceled their ${formatEtDateTime(change.from)} class.`;
    await Promise.all(
      admins.map((admin) =>
        createNotification({ userId: admin.id, type: "LESSON_BOOKING_RECEIVED", title, body, emailCategory: "classes" }).catch((err) =>
          console.error("Admin self-change notification failed (non-blocking):", err),
        ),
      ),
    );
  } catch (err) {
    console.error("Admin self-change notification failed (non-blocking):", err);
  }
}

async function notifyAdminsOfFamilyBooking(
  attendeeIds: string[],
  schedule: { label: string | null },
  scheduledAt: Date,
) {
  const [students, admins] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: attendeeIds } }, select: { name: true, email: true } }),
    getAdminRecipients("NEW_BOOKING"),
  ]);
  const names = students.map((s) => s.name ?? s.email).join(", ");
  const when = scheduledAt.toLocaleString("en-US", { timeZone: ET_ZONE, dateStyle: "full", timeStyle: "short" });
  const endsAt = new Date(scheduledAt.getTime() + (FAMILY_CREDITS_PER_STUDENT / CREDITS_PER_CLASS) * CLASS_MINUTES * 60_000).toLocaleTimeString("en-US", {
    timeZone: ET_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
  const classLabel = schedule.label ?? "class";

  await Promise.all(
    admins.map((admin) =>
      createNotification({
        userId: admin.id,
        type: "LESSON_BOOKING_RECEIVED",
        title: "New family booking",
        body: `${names} booked the ${classLabel} ${when} to ${endsAt} together (${creditsLabelFromStored(FAMILY_CREDITS_PER_STUDENT)} each).`,
        emailCategory: "classes",
      }),
    ),
  );
}

export interface BundleBookingSelection {
  scheduleId: string;
  occurrenceDateMs: number;
  chunkIndex: number;
  /** Same optional meaning as bookClass's own param, omit for the chunk's full length. */
  creditsToBook?: number;
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
 * transaction across every selection, each occurrence has its own
 * capacity and its own failure mode (already full, already booked, not
 * enough credits *at that point in the loop*), and failing selection #3
 * because someone else took the last seat shouldn't undo #1 and #2, which
 * genuinely succeeded. Every selection goes through the exact same
 * `bookClass` a single booking does, same Serializable transaction, same
 * capacity/credit/de-dupe checks, same rate limit (counted per class
 * booked, same as if they'd been submitted one at a time), this just
 * loops it and reports one outcome per selection instead of one for the
 * whole batch.
 *
 * Duplicate selections (the same occurrence picked twice, e.g. a
 * double-click race) collapse to a single attempt, `bookClass` itself
 * would just report the second as "already booked" otherwise, which reads
 * like a real failure for something that was never a real second request.
 */
export async function bookClassBundle(studentId: string, selections: BundleBookingSelection[]): Promise<BundleBookingResult[]> {
  const seen = new Set<string>();
  const deduped = selections.filter((s) => {
    const key = `${s.scheduleId}:${s.occurrenceDateMs}:${s.chunkIndex}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const results: BundleBookingResult[] = [];
  for (const selection of deduped) {
    try {
      const booking = await bookClass(studentId, selection.scheduleId, selection.occurrenceDateMs, selection.chunkIndex, selection.creditsToBook);
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

// ---------------------------------------------------------------------------
// Family booking, 2+ named, verified accounts sharing one occurrence.
// ---------------------------------------------------------------------------

export interface FamilyAttendeeCheck {
  email: string;
  found: boolean;
  /** Only set when found and verified, lets the booker visually confirm
      "yes, that's my kid's account" for an email they themselves just
      typed, not a stranger's private data. */
  name: string | null;
  userId: string | null;
  verified: boolean;
}

/**
 * Live, side-effect-free-beyond-its-own-rate-limit-ledger lookup used while
 * the booker is still filling in attendee emails, same shape and reasoning
 * as payments.ts's checkFamilyBundleRecipients (a typo should be caught and
 * fixed before submitting, not surface as a confusing failure at the end),
 * reusing that same rate-limit ledger rather than standing up a second
 * table for what's the same abuse vector (probing account existence by
 * email). The one real difference: a family *booking* requires the account
 * to be email-verified, not just existing, payments.ts's own check never
 * needed that, since crediting an unverified account for a purchase is a
 * different risk than letting them occupy a live class slot.
 */
export async function checkFamilyClassAttendees(callerId: string, emails: string[]): Promise<FamilyAttendeeCheck[]> {
  await assertRateLimit(
    prisma.familyBundleCheckAttempt.count,
    { userId: callerId },
    { windowMinutes: 10, max: 30, message: "Too many account checks. Please wait a few minutes and try again." },
  );
  await prisma.familyBundleCheckAttempt.create({ data: { userId: callerId } });

  const normalized = emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (normalized.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { email: { in: normalized } },
    select: { id: true, email: true, name: true, emailVerified: true },
  });
  const byEmail = new Map(users.map((u) => [u.email, u]));

  return normalized.map((email) => {
    const user = byEmail.get(email);
    return {
      email,
      found: Boolean(user),
      name: user?.name ?? null,
      userId: user?.id ?? null,
      verified: Boolean(user?.emailVerified),
    };
  });
}

/**
 * Books one occurrence for a named family group, 2+ verified accounts,
 * each charged FAMILY_CREDITS_PER_STUDENT once markAttendance runs, same
 * deferred-charge rule bookClass uses. One ClassBooking row per attendee
 * (so each kid's own credits, attendance, and history stay theirs), all
 * sharing one familyBookingGroupId so the roster can display them as one
 * party and one occurrence slot (capacity is per-occurrence, not per-row,
 * see getUpcomingOccurrences).
 *
 * `initiatorId` is whoever is logged in and clicking the button, used only
 * for the rate-limit/authorization boundary in the calling Server Action,
 * not assumed to be one of the attendees. Every named email must resolve to
 * a real, verified account; nothing here accepts an arbitrary string as a
 * stand-in for a real student.
 */
export async function bookFamilyClass(
  initiatorId: string,
  scheduleId: string,
  occurrenceDateMs: number,
  chunkIndex: number,
  attendeeEmails: string[],
) {
  const normalizedEmails = Array.from(new Set(attendeeEmails.map((e) => e.trim().toLowerCase()).filter(Boolean)));
  if (normalizedEmails.length < FAMILY_MIN_ATTENDEES) {
    throw new ClassBookingError(
      `A family booking needs at least ${FAMILY_MIN_ATTENDEES} students. For just one, use the regular one-on-one booking instead.`,
    );
  }

  const schedule = await prisma.classSchedule.findUniqueOrThrow({ where: { id: scheduleId } });
  if (!schedule.active) throw new ClassBookingError("This class is no longer offered.");

  const chunk = chunksForSchedule(schedule)[chunkIndex];
  if (!chunk) throw new ClassBookingError("That time slot doesn't exist.");
  if (chunk.creditCost < FAMILY_CREDITS_PER_STUDENT) {
    throw new ClassBookingError("This time slot is too short for a family class.");
  }

  const occurrenceDate = new Date(occurrenceDateMs);
  const { hour, minute } = parseStartTime(schedule.startTime);
  const scheduledAt = new Date(
    etWallTimeToUtc(
      occurrenceDate.getUTCFullYear(),
      occurrenceDate.getUTCMonth() + 1,
      occurrenceDate.getUTCDate(),
      hour,
      minute,
    ).getTime() + chunk.offsetMin * 60_000,
  );
  if (scheduledAt.getTime() <= Date.now()) {
    throw new ClassBookingError("That class has already started or passed.");
  }
  await assertBookingAllowed(scheduledAt, { family: true });

  await assertRateLimit(
    prisma.classBooking.count,
    { studentId: initiatorId },
    { windowMinutes: 60, max: await getNumberSetting("booking.perHourLimit"), message: "You're booking too fast. Please wait a bit and try again." },
  );

  // Re-verified here, never trusted from whatever the client last showed,
  // the live check above is a UX convenience, not the actual authorization.
  const attendees = await prisma.user.findMany({
    where: { email: { in: normalizedEmails } },
    select: { id: true, email: true, emailVerified: true },
  });
  const byEmail = new Map(attendees.map((u) => [u.email, u]));
  const unresolved = normalizedEmails.filter((e) => !byEmail.get(e)?.emailVerified);
  if (unresolved.length > 0) {
    throw new ClassBookingError(`These emails aren't verified accounts on file: ${unresolved.join(", ")}.`);
  }

  // Same rule bookClass enforces for a solo self-booking, applied per
  // attendee here: each attendee spends their own classCredits once
  // markAttendance runs (see this function's own doc comment above), so an
  // attendee with an active Payment Plan spending some of that balance on an
  // ad hoc family booking is exactly the same side door bookClass already
  // closes, just reached by naming them as someone else's family-booking
  // attendee instead of booking for themselves directly. The initiator
  // isn't assumed to be one of the attendees, but nothing stops them from
  // naming themselves, so this has to check every resolved attendee, not
  // just initiatorId.
  const attendeesWithActivePlans = await prisma.paymentPlan.findMany({
    where: { userId: { in: attendees.map((a) => a.id) }, status: "ACTIVE" },
    select: { userId: true },
  });
  if (attendeesWithActivePlans.length > 0) {
    const activeIds = new Set(attendeesWithActivePlans.map((p) => p.userId));
    const namesOnPlans = normalizedEmails.filter((e) => activeIds.has(byEmail.get(e)!.id));
    throw new ClassBookingError(
      `${namesOnPlans.join(", ")} already ${namesOnPlans.length === 1 ? "has" : "have"} an active payment plan and can't be added to an ad hoc family booking, message support to change anything about their schedule.`,
    );
  }

  const familyBookingGroupId = crypto.randomUUID();

  let bookings;
  try {
    bookings = await prisma.$transaction(
      async (tx) => {
        const takenByAnyone = await tx.classBooking.findFirst({ where: { scheduleId, occurrenceDate, scheduledAt, status: "SCHEDULED" } });
        if (takenByAnyone) throw new ClassBookingError("This time was just booked. Pick another slot.");

        // Same defense-in-depth as bookClass's own guard (see its comment),
        // a family booking never coincides with a solo Payment Plan
        // reservation on the same chunk, regardless of who's in the family
        // group, since the reservation's own auto-booking is always a solo
        // row for exactly one student.
        const reservedByPlan = await tx.paymentPlan.findFirst({
          where: { reservedScheduleId: scheduleId, reservedChunkIndex: chunkIndex, OR: livePaymentPlanConditions() },
          select: { id: true },
        });
        if (reservedByPlan) {
          throw new ClassBookingError("This time is reserved for another student's payment plan.");
        }

        const created: Prisma.ClassBookingGetPayload<Record<string, never>>[] = [];
        for (const email of normalizedEmails) {
          const attendee = byEmail.get(email)!;

          const existing = await tx.classBooking.findUnique({
            where: { studentId_scheduleId_occurrenceDate: { studentId: attendee.id, scheduleId, occurrenceDate } },
          });
          if (existing?.status === "SCHEDULED") {
            throw new ClassBookingError(`${email} already has a booking for this occurrence.`);
          }

          const otherBookingSameDay = await tx.classBooking.findFirst({
            where: { studentId: attendee.id, occurrenceDate, status: "SCHEDULED", NOT: { scheduleId } },
            select: { id: true },
          });
          if (otherBookingSameDay) {
            throw new ClassBookingError(`${email} already has a different class booked that day, one class per day per student.`);
          }

          const [user, pending] = await Promise.all([
            tx.user.findUniqueOrThrow({ where: { id: attendee.id }, select: { classCredits: true } }),
            tx.classBooking.aggregate({ where: { studentId: attendee.id, status: "SCHEDULED" }, _sum: { creditsSpent: true } }),
          ]);
          const available = user.classCredits - (pending._sum.creditsSpent ?? 0);
          if (available < FAMILY_CREDITS_PER_STUDENT) {
            throw new ClassBookingError(`${email} needs ${FAMILY_CREDITS_PER_STUDENT} credits available. They have ${available} free right now.`);
          }

          const data = {
            scheduledAt,
            creditsSpent: FAMILY_CREDITS_PER_STUDENT,
            status: "SCHEDULED" as const,
            attendance: null,
            refunded: false,
            canceledReason: null,
            familyBookingGroupId,
          };

          created.push(
            existing
              ? await tx.classBooking.update({ where: { id: existing.id }, data })
              : await tx.classBooking.create({ data: { studentId: attendee.id, scheduleId, occurrenceDate, ...data } }),
          );
        }
        return created;
      },
      { isolationLevel: "Serializable" },
    );
  } catch (err) {
    if (err instanceof ClassBookingError) throw err;
    if ((err as Prisma.PrismaClientKnownRequestError)?.code === "P2002") {
      throw new ClassBookingError("One of these students already has a booking for this occurrence.");
    }
    if ((err as Prisma.PrismaClientKnownRequestError)?.code === "P2034") {
      throw new ClassBookingError("That slot was just taken. Try again.");
    }
    throw err;
  }

  notifyAdminsOfFamilyBooking(
    attendees.map((a) => a.id),
    schedule,
    scheduledAt,
  ).catch((err) => console.error("Admin family booking notification failed (non-blocking):", err));
  await Promise.all(attendees.map((a) => noticeBookingConfirmed({ studentId: a.id, scheduledAt, label: schedule.label, storedCredits: FAMILY_CREDITS_PER_STUDENT })));

  return bookings;
}

// ---------------------------------------------------------------------------
// Reserved recurring slots, a Payment Plan's own weekly day/time, held
// exclusively for as long as the plan (or its final still-live CreditGrant)
// stays active. See PaymentPlan.reservedScheduleId's schema comment and
// paymentPlans.ts's createPaymentPlan for enrollment; the daily
// netlify/functions/payment-plan-reservations.ts job is what actually keeps
// a rolling OCCURRENCES_PER_SLOT window of real ClassBooking rows booked
// against a reservation, using createReservedBookingIfAbsent below.
// ---------------------------------------------------------------------------

export interface ReservableSlot {
  scheduleId: string;
  label: string | null;
  dayOfWeek: number;
  startTime: string;
  chunkIndex: number;
  /** This chunk's own credit ceiling, always >= creditsPerWeek, the same meaning ClassOccurrence.creditCost has. */
  creditCost: number;
}

/**
 * Every active schedule's chunks with room for `creditsPerWeek`, excluding
 * (a) any chunk another live Payment Plan already reserves (see
 * livePaymentPlanConditions) and (b) any chunk that isn't reserved by a
 * plan but already has an ordinary self-serve ClassBooking (from bookClass/
 * bookFamilyClass, made before any reservation existed) on one of its own
 * upcoming OCCURRENCES_PER_SLOT occurrences, reserving over that would let
 * the maintenance job silently create a second, conflicting booking for the
 * same instant the next time it runs. Feeds the enrollment slot picker.
 * Unlike getUpcomingOccurrences, this is otherwise not about any specific
 * week: a reservation is a standing claim on the recurring slot itself.
 */
export async function getReservableSlots(creditsPerWeek: number): Promise<ReservableSlot[]> {
  const [schedules, reservedPlans] = await Promise.all([
    prisma.classSchedule.findMany({ where: { active: true }, orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] }),
    prisma.paymentPlan.findMany({
      where: { reservedScheduleId: { not: null }, OR: livePaymentPlanConditions() },
      select: { reservedScheduleId: true, reservedChunkIndex: true },
    }),
  ]);

  const reservedKeys = new Set(reservedPlans.map((p) => `${p.reservedScheduleId}:${p.reservedChunkIndex}`));

  const candidates: { schedule: (typeof schedules)[number]; chunk: ScheduleChunk }[] = [];
  for (const schedule of schedules) {
    for (const chunk of chunksForSchedule(schedule)) {
      if (chunk.creditCost < creditsPerWeek) continue;
      if (reservedKeys.has(`${schedule.id}:${chunk.chunkIndex}`)) continue;
      candidates.push({ schedule, chunk });
    }
  }
  if (candidates.length === 0) return [];

  // One grouped query across every remaining candidate's own upcoming
  // occurrences, same shape as getUpcomingOccurrences's own bookedKeys
  // query, rather than one query per candidate.
  const instants = candidates.flatMap(({ schedule, chunk }) =>
    nextOccurrenceDates(schedule.dayOfWeek, OCCURRENCES_PER_SLOT).map((occurrenceDate) => ({
      chunkKey: `${schedule.id}:${chunk.chunkIndex}`,
      scheduleId: schedule.id,
      occurrenceDate,
      scheduledAt: computeScheduledAt(schedule, occurrenceDate, chunk),
    })),
  );
  const bookedCounts = await prisma.classBooking.groupBy({
    by: ["scheduleId", "occurrenceDate", "scheduledAt"],
    where: {
      status: "SCHEDULED",
      OR: instants.map((i) => ({ scheduleId: i.scheduleId, occurrenceDate: i.occurrenceDate, scheduledAt: i.scheduledAt })),
    },
    _count: { _all: true },
  });
  const bookedInstantKeys = new Set(
    bookedCounts.filter((b) => b._count._all > 0).map((b) => `${b.scheduleId}:${b.occurrenceDate.getTime()}:${b.scheduledAt.getTime()}`),
  );
  const chunksWithConflict = new Set(
    instants
      .filter((i) => bookedInstantKeys.has(`${i.scheduleId}:${i.occurrenceDate.getTime()}:${i.scheduledAt.getTime()}`))
      .map((i) => i.chunkKey),
  );

  return candidates
    .filter(({ schedule, chunk }) => !chunksWithConflict.has(`${schedule.id}:${chunk.chunkIndex}`))
    .map(({ schedule, chunk }) => ({
      scheduleId: schedule.id,
      label: schedule.label,
      dayOfWeek: schedule.dayOfWeek,
      // The PIECE's own start time (window start + its offset), not the whole
      // window's: every piece of an 11:00-3:00 window used to read "11:00 AM".
      startTime: addMinutesToHHmm(schedule.startTime, chunk.offsetMin),
      chunkIndex: chunk.chunkIndex,
      creditCost: chunk.creditCost,
    }));
}

export interface ReservedBookingParams {
  studentId: string;
  scheduleId: string;
  occurrenceDate: Date;
  scheduledAt: Date;
  creditsSpent: number;
  planId: string;
}

/**
 * Creates (or reuses a CANCELED row for) one week's booking backing a
 * Payment Plan's reservation, the building block
 * netlify/functions/payment-plan-reservations.ts calls once per plan per
 * occurrence in its rolling window. Same "reuse a CANCELED row for this
 * occurrence instead of hitting the unique constraint" idiom bookClass
 * already uses. No-ops (returns null) if a SCHEDULED row for this exact
 * (studentId, scheduleId, occurrenceDate) already exists, from an earlier
 * run of this same job, or the student booking it themselves, rather than
 * erroring, since "already booked" is the steady state here most days, not
 * a failure. `db` defaults to the plain client, same convention as
 * addClassCredits, the caller wraps in its own transaction/retry if it
 * needs one (see the P2002 handling in payment-plan-reservations.ts).
 */
export async function createReservedBookingIfAbsent(
  params: ReservedBookingParams,
  db: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const { studentId, scheduleId, occurrenceDate, scheduledAt, creditsSpent, planId } = params;
  // The members of a family plan share one weekly class: their rows form one booking party (one credit charge per row).
  const familyGroupId = (await db.paymentPlan.findUnique({ where: { id: planId }, select: { familyGroupId: true } }))?.familyGroupId ?? null;

  const existing = await db.classBooking.findUnique({
    where: { studentId_scheduleId_occurrenceDate: { studentId, scheduleId, occurrenceDate } },
  });
  if (existing?.status === "SCHEDULED") return null;
  // Canceled on purpose, by the student (24+ hours ahead) or by the studio: do not book it again.
  // A plan-wide cancel leaves no reason, so those can still be booked by a new plan.
  if (existing?.status === "CANCELED" && existing.canceledReason !== null) return null;

  // One class a day: another SCHEDULED class the same day wins over the weekly slot.
  const sameDay = await db.classBooking.findFirst({
    where: { studentId, occurrenceDate, status: "SCHEDULED", NOT: { scheduleId } },
    select: { id: true },
  });
  if (sameDay) return null;

  // Defense-in-depth against a different student somehow already holding
  // this exact instant despite the enrollment-time conflict check
  // (createPaymentPlan) and bookClass/bookFamilyClass's own reserved-slot
  // guard, should be unreachable in practice, but this is what stops the
  // maintenance job from ever creating a second, silently conflicting
  // SCHEDULED row instead of just skipping and letting an admin notice.
  const conflict = await db.classBooking.findFirst({
    where: {
      scheduleId,
      occurrenceDate,
      scheduledAt,
      status: "SCHEDULED",
      studentId: { not: studentId },
      ...(familyGroupId ? { OR: [{ familyBookingGroupId: null }, { familyBookingGroupId: { not: familyGroupId } }] } : {}),
    },
    select: { id: true },
  });
  if (conflict) {
    console.error(
      `Reserved booking conflict: plan ${planId}'s student ${studentId} vs. existing booking ${conflict.id} at schedule ${scheduleId}, ${occurrenceDate.toISOString()}: skipped, needs admin attention.`,
    );
    return null;
  }

  const data = {
    scheduledAt,
    creditsSpent,
    status: "SCHEDULED" as const,
    attendance: null,
    refunded: false,
    canceledReason: null,
    familyBookingGroupId: familyGroupId,
    reservedByPlanId: planId,
  };

  return existing
    ? db.classBooking.update({ where: { id: existing.id }, data })
    : db.classBooking.create({ data: { studentId, scheduleId, occurrenceDate, ...data } });
}

/**
 * Best-effort direct booking for the one-off occurrence a student already
 * paid EXTRA_SESSION_FLAT_PRICE_CENTS for (see
 * getOrCreatePendingExtraSessionPayment in payments.ts). Called from
 * approveZellePayment once that payment verifies, not from the student's
 * own request, so unlike bookClass there's no rate limit or credit-balance
 * check here, the credit itself is granted separately in the same
 * transaction; this only claims the seat. Same conflict-checking idiom as
 * createReservedBookingIfAbsent above, minus reservedByPlanId (this is an
 * ordinary one-off booking, not a standing weekly reservation).
 *
 * Returns false, never throws, if the exact instant was claimed by someone
 * else, or if the student's own calendar day is no longer free (one class
 * a day, see assertNoOtherBookingSameDay), in the gap between the student
 * picking it and the payment clearing review, that gap is normally hours to
 * a couple of days, not the seconds bookClass's own transaction races
 * against. The caller still grants the credit either way (real money
 * changed hands) and just leaves the student to pick a different open time
 * themselves, the same behavior this flow replaces for everyone except
 * this one edge case.
 */
export async function bookExtraSessionOccurrence(
  params: { studentId: string; scheduleId: string; occurrenceDate: Date; scheduledAt: Date; creditsSpent: number },
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<boolean> {
  const { studentId, scheduleId, occurrenceDate, scheduledAt, creditsSpent } = params;

  const existing = await db.classBooking.findUnique({
    where: { studentId_scheduleId_occurrenceDate: { studentId, scheduleId, occurrenceDate } },
  });
  if (existing?.status === "SCHEDULED") return true; // already booked somehow (a retried approval, say), nothing to do

  const conflict = await db.classBooking.findFirst({
    where: { scheduleId, occurrenceDate, scheduledAt, status: "SCHEDULED", studentId: { not: studentId } },
    select: { id: true },
  });
  if (conflict) return false;

  // One class a day, same rule assertNoOtherBookingSameDay enforces for
  // bookClass/bookFamilyClass. getOrCreatePendingExtraSessionPayment already
  // refuses to sell an extra session for a day the student's already
  // booked, but this is the gap that check can't close by itself: the
  // student could book a regular class in the hours-to-days between paying
  // for the extra and an admin actually approving it. Same "return false,
  // don't throw" idiom as the conflict check above, for the same reason,
  // the credit is granted either way (real money changed hands), this only
  // ever refuses the specific seat.
  const sameDayConflict = await db.classBooking.findFirst({
    where: { studentId, occurrenceDate, status: "SCHEDULED", NOT: { scheduleId } },
    select: { id: true },
  });
  if (sameDayConflict) return false;

  const data = {
    scheduledAt,
    creditsSpent,
    status: "SCHEDULED" as const,
    attendance: null,
    refunded: false,
    canceledReason: null,
    familyBookingGroupId: null,
    reservedByPlanId: null,
  };
  if (existing) {
    await db.classBooking.update({ where: { id: existing.id }, data });
  } else {
    await db.classBooking.create({ data: { studentId, scheduleId, occurrenceDate, ...data } });
  }
  return true;
}

/** Called from approveZellePayment once a CLASS_CREDITS payment verifies.
 *  `db` defaults to the plain client but accepts a transaction client, see
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

export interface WeeklyCreditUsage {
  weekStartMs: number;
  weekEndMs: number;
  creditsUsedThisWeek: number;
  /** Null when the student has no ACTIVE Payment Plan (a family-bundle-only
      or between-plans student has no fixed weekly commitment to compare
      against, so their own /lessons page just shows raw usage instead). */
  weeklyAllotment: number | null;
}

/**
 * Powers the "this week" card a Payment Plan subscriber sees on /lessons:
 * how much of a student's own weekly commitment they've actually used,
 * calendar-week (Sun-Sat) based
 * rather than a rolling 7 days, matching how a person actually thinks about
 * "this week" versus "next week." Counts SCHEDULED and COMPLETED bookings
 * (a CANCELED one was never actually going to cost anything, see
 * cancelClassBooking) whose scheduledAt falls in that window, regardless of
 * source (a plan's own auto-booked slot, a manually booked extra session,
 * or a family session): the number a student cares about is "how much of
 * my week is spoken for," not which purchase paid for which class.
 */
export async function getWeeklyCreditUsage(studentId: string): Promise<WeeklyCreditUsage> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(startOfToday.getTime() - startOfToday.getDay() * 24 * 60 * 60 * 1000);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [plan, bookings] = await Promise.all([
    prisma.paymentPlan.findFirst({ where: { userId: studentId, status: "ACTIVE" }, select: { cadence: true } }),
    prisma.classBooking.findMany({
      where: { studentId, status: { in: ["SCHEDULED", "COMPLETED"] }, scheduledAt: { gte: weekStart, lt: weekEnd } },
      select: { creditsSpent: true },
    }),
  ]);

  return {
    weekStartMs: weekStart.getTime(),
    weekEndMs: weekEnd.getTime(),
    creditsUsedThisWeek: bookings.reduce((sum, b) => sum + b.creditsSpent, 0),
    weeklyAllotment: plan ? PLAN_CADENCE_CREDITS_PER_WEEK[plan.cadence] : null,
  };
}

/**
 * Self-serve cancellation, up to the cutoff (6 hours by default) before the class start. Always
 * refunds the spent credits and frees the seat (there's no other outcome:
 * self-cancel simply isn't offered once inside the window). A student who
 * needs to cancel inside the cutoff has to message support instead; any refund at
 * that point is a manual, discretionary admin credit adjustment, not
 * something this function grants automatically.
 */
/**
 * canceledReason stamped on a plan-reserved class its student cancelled
 * themselves. The daily reservation job (createReservedBookingIfAbsent) leaves
 * a class carrying it alone, instead of booking it again the next morning.
 */
export const SKIPPED_BY_STUDENT = "SKIPPED_BY_STUDENT";

export async function cancelClassBooking(bookingId: string, studentId: string): Promise<{ refunded: true }> {
  const booking = await prisma.classBooking.findUniqueOrThrow({ where: { id: bookingId } });
  if (booking.studentId !== studentId) throw new ClassBookingError("Not your booking.");
  if (booking.status !== "SCHEDULED") throw new ClassBookingError("This booking isn't active.");

  if (!(await getBoolSetting("cancel.studentCanCancel"))) {
    throw new ClassBookingError("Classes can't be canceled in the app right now. Message us and we'll help.");
  }
  const cancelCutoffHours = await getNumberSetting("cancel.cutoffHours");
  const hoursUntil = (booking.scheduledAt.getTime() - Date.now()) / 3_600_000;
  if (hoursUntil < cancelCutoffHours) {
    throw new ClassBookingError(
      `Too close to class time to cancel yourself (inside ${cancelCutoffHours} hours). Message us and we'll help.`,
    );
  }

  // No credit mutation here: the real charge doesn't land until
  // markAttendance runs (see that function's own comment), and a booking
  // still SCHEDULED at this point has never been attendance-marked, there
  // is nothing to refund because nothing was ever actually taken. `refunded`
  // stays true regardless, meaning "this booking never cost you anything."
  await prisma.classBooking.update({
    where: { id: bookingId },
    data: { status: "CANCELED", refunded: true, ...(booking.reservedByPlanId ? { canceledReason: SKIPPED_BY_STUDENT } : {}) },
  });

  await createNotification({
    userId: studentId,
    type: "LESSON_BOOKING_CANCELED",
    title: "Class canceled",
    body: `Your ${formatEtDateTime(booking.scheduledAt)} class was canceled. No credits were charged.`,
    emailCategory: "classes",
  });

  await notifyAdminsOfSelfChange(studentId, { from: booking.scheduledAt });

  return { refunded: true };
}

/**
 * Self-service reschedule, by direct instruction, the one real gap in
 * solo booking: moving a class used to mean cancel, then separately go
 * re-book a different open slot, two round trips with a real risk of
 * losing the old slot's credit hold before the new one is confirmed. This
 * does both atomically: same >=CANCELLATION_CUTOFF_HOURS eligibility as
 * cancelClassBooking (an inside-the-cutoff reschedule still isn't self-service,
 * same reasoning, message us instead), then the target slot goes through
 * the exact same capacity/reserved-plan/one-class-a-day/credit checks
 * bookClass's own transaction runs, minus the Payment Plan self-book block
 * (a plan subscriber's ad hoc bookings, as opposed to their standing
 * reserved slot, see changeReservedSlot in paymentPlans.ts for that one,
 * are still fair game here) since this is explicitly a *move*, not a new
 * booking layered on top of an existing one.
 *
 * The old booking's own credits are treated as already freed for the
 * purposes of the new slot's credit check (excluded from the "pending"
 * sum, same idea as cancelClassBooking never actually charging anything),
 * so a straight swap never requires more balance than the student already
 * had reserved. Both the cancel and the new booking happen inside one
 * Serializable transaction, a partial "old slot freed, new slot never
 * claimed" outcome would be strictly worse than the plain two-step flow
 * this replaces.
 */
export async function rescheduleClassBooking(
  studentId: string,
  bookingId: string,
  newScheduleId: string,
  newOccurrenceDateMs: number,
  newChunkIndex: number,
  newCreditsToBook?: number,
  /** byAdmin: the studio moves the class for the student. The student-facing switch, the cancellation cutoff, the booking-request mode and the weekly limit do not apply. */
  options: { byAdmin?: boolean } = {},
) {
  const byAdmin = Boolean(options.byAdmin);
  const oldBooking = await prisma.classBooking.findUniqueOrThrow({ where: { id: bookingId } });
  if (oldBooking.studentId !== studentId) throw new ClassBookingError("Not your booking.");
  if (oldBooking.status !== "SCHEDULED") throw new ClassBookingError("This booking isn't active.");
  if (byAdmin && oldBooking.scheduledAt.getTime() <= Date.now()) throw new ClassBookingError("That class has already started or passed.");

  if (!byAdmin && !(await getBoolSetting("cancel.studentCanReschedule"))) {
    throw new ClassBookingError("Classes can't be rescheduled in the app right now. Message us and we'll help.");
  }
  const rescheduleCutoffHours = await getNumberSetting("cancel.cutoffHours");
  const hoursUntil = (oldBooking.scheduledAt.getTime() - Date.now()) / 3_600_000;
  if (!byAdmin && hoursUntil < rescheduleCutoffHours) {
    throw new ClassBookingError(
      `Too close to class time to reschedule yourself (inside ${rescheduleCutoffHours} hours). Message us and we'll help.`,
    );
  }

  const newSchedule = await prisma.classSchedule.findUniqueOrThrow({ where: { id: newScheduleId } });
  if (!newSchedule.active) throw new ClassBookingError("This class is no longer offered.");
  const chunk = chunksForSchedule(newSchedule)[newChunkIndex];
  if (!chunk) throw new ClassBookingError("That time slot doesn't exist.");

  // One fixed class size, same as bookClass.
  const credits = chunk.creditCost;
  if (newCreditsToBook !== undefined && newCreditsToBook !== credits) {
    throw new ClassBookingError("Classes are 45 minutes. Please book a full class.");
  }

  const newOccurrenceDate = new Date(newOccurrenceDateMs);
  const newScheduledAt = computeScheduledAt(newSchedule, newOccurrenceDate, chunk);
  if (newScheduledAt.getTime() <= Date.now()) {
    throw new ClassBookingError("That class has already started or passed.");
  }
  if (!byAdmin) await assertBookingAllowed(newScheduledAt);
  if (
    newScheduleId === oldBooking.scheduleId &&
    newOccurrenceDate.getTime() === oldBooking.occurrenceDate.getTime() &&
    newScheduledAt.getTime() === oldBooking.scheduledAt.getTime()
  ) {
    throw new ClassBookingError("That's already your booked time.");
  }

  await assertRateLimit(
    prisma.classBooking.count,
    { studentId },
    { windowMinutes: 60, max: 20, message: "You're rescheduling too fast. Please wait a bit and try again." },
  );

  let newBooking;
  try {
    newBooking = await prisma.$transaction(
      async (tx) => {
        const takenByAnyone = await tx.classBooking.findFirst({
          where: { scheduleId: newScheduleId, occurrenceDate: newOccurrenceDate, scheduledAt: newScheduledAt, status: "SCHEDULED" },
        });
        if (takenByAnyone && takenByAnyone.studentId !== studentId) {
          throw new ClassBookingError("This time was just booked by someone else. Pick another slot.");
        }

        const reservedByOtherPlan = await tx.paymentPlan.findFirst({
          where: { reservedScheduleId: newScheduleId, reservedChunkIndex: newChunkIndex, userId: { not: studentId }, OR: livePaymentPlanConditions() },
          select: { id: true },
        });
        if (reservedByOtherPlan) {
          throw new ClassBookingError("This time is reserved for another student's payment plan.");
        }

        // Excludes both the target schedule (self-rebook idiom, same as
        // bookClass) and the old booking being replaced, this is a move,
        // not a second class on the same day.
        const otherBookingSameDay = await tx.classBooking.findFirst({
          where: {
            studentId,
            occurrenceDate: newOccurrenceDate,
            status: "SCHEDULED",
            NOT: [{ scheduleId: newScheduleId }, { id: oldBooking.id }],
          },
          select: { id: true },
        });
        if (otherBookingSameDay) {
          throw new ClassBookingError("You can only book one class per day, message support if you need a second class on the same day.");
        }

        if (!byAdmin) await assertWithinSubscriberWeeklyLimit(tx, studentId, newOccurrenceDate, { bookingId: oldBooking.id });

        const [user, pendingOthers] = await Promise.all([
          tx.user.findUniqueOrThrow({ where: { id: studentId }, select: { classCredits: true } }),
          tx.classBooking.aggregate({
            where: { studentId, status: "SCHEDULED", NOT: { id: oldBooking.id } },
            _sum: { creditsSpent: true },
          }),
        ]);
        const available = user.classCredits - (pendingOthers._sum.creditsSpent ?? 0);
        if (available < credits) {
          throw new ClassBookingError(
            `You need ${creditsLabelFromStored(credits)} available. You have ${creditsLabelFromStored(available)} free right now.`,
          );
        }

        // A plan's weekly class moved for one week only: the old day is marked
        // skipped so the nightly reservation job leaves it alone, and the new
        // booking keeps the plan link. The standing weekly slot is unchanged
        // (changeReservedSlot in paymentPlans.ts moves that one for good).
        await tx.classBooking.update({
          where: { id: oldBooking.id },
          data: { status: "CANCELED", refunded: true, ...(oldBooking.reservedByPlanId ? { canceledReason: SKIPPED_BY_STUDENT } : {}) },
        });

        // Same reuse-a-CANCELED-row idiom bookClass uses, this also
        // transparently covers "same schedule, different time," since
        // canceling the old booking above just made this exact
        // (studentId, scheduleId, occurrenceDate) key available to reuse.
        const existingTarget = await tx.classBooking.findUnique({
          where: { studentId_scheduleId_occurrenceDate: { studentId, scheduleId: newScheduleId, occurrenceDate: newOccurrenceDate } },
        });

        if (existingTarget) {
          return tx.classBooking.update({
            where: { id: existingTarget.id },
            data: {
              status: "SCHEDULED",
              scheduledAt: newScheduledAt,
              creditsSpent: credits,
              attendance: null,
              refunded: false,
              canceledReason: null,
              familyBookingGroupId: null,
              reservedByPlanId: oldBooking.reservedByPlanId,
            },
          });
        }

        return tx.classBooking.create({
          data: {
            studentId,
            scheduleId: newScheduleId,
            occurrenceDate: newOccurrenceDate,
            scheduledAt: newScheduledAt,
            creditsSpent: credits,
            reservedByPlanId: oldBooking.reservedByPlanId,
          },
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
      throw new ClassBookingError("That slot was just taken. Try again.");
    }
    throw err;
  }

  await createNotification({
    userId: studentId,
    type: "LESSON_BOOKING_CANCELED",
    title: byAdmin ? "Your class was moved" : "Class rescheduled",
    body: byAdmin
      ? `The studio moved your ${formatEtDateTime(oldBooking.scheduledAt)} class to ${formatEtDateTime(newScheduledAt)}. No credits were charged for the change.`
      : `Your class moved to ${formatEtDateTime(newScheduledAt)}. No credits were charged for the change.`,
    emailCategory: "classes",
  });
  if (!byAdmin) await notifyAdminsOfSelfChange(studentId, { from: oldBooking.scheduledAt, to: newScheduledAt });

  return newBooking;
}

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { chunksForSchedule, ClassBookingError, classesOverlap, computeScheduledAt, oneOffScheduleFor, ONE_OFF_LABEL, parseCustomTime, todayBoundsEt } from "@/lib/classSchedule";
import { CLASS_MINUTES } from "@/lib/classCreditPricing";
import { addMinutesToHHmm } from "@/lib/classScheduleLabels";
import { parseDay } from "@/lib/slotHolds";
import { validateReservationContact, type ReservationInput } from "@/lib/ownerReservations";
import { joinTimes } from "@/lib/reservationEmail";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function time12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export interface ReservableHour {
  scheduleId: string;
  chunkIndex: number;
  dayOfWeek: number;
  /** "4:00 PM" */
  time: string;
}

/** Every hour the studio offers, by weekday, so the form can show the hours of the day picked. */
export async function getReservableHours(): Promise<ReservableHour[]> {
  const schedules = await prisma.classSchedule.findMany({ where: { active: true }, orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] });
  return schedules.flatMap((schedule) =>
    chunksForSchedule(schedule).map((chunk) => ({
      scheduleId: schedule.id,
      chunkIndex: chunk.chunkIndex,
      dayOfWeek: schedule.dayOfWeek,
      time: time12(addMinutesToHHmm(schedule.startTime, chunk.offsetMin)),
    })),
  );
}

export interface CreateReservationInput extends ReservationInput {
  /** "YYYY-MM-DD", the Eastern calendar day. */
  date: string;
  /** null = the whole day (every window); otherwise just these hours. Ignored when `time` is given. */
  hours: { scheduleId: string; chunkIndex: number }[] | null;
  /**
   * "HH:mm" Eastern: on a day with no weekly times (the owner said yes to "You don't usually teach..."), keep one class at this
   * exact start. It lives on the hidden one-off schedule, like a class booked at a typed time.
   */
  time?: string;
}

/**
 * Keeps a day, or some hours of it, for a named customer. Nobody can book it until it is released. Refused when the day is
 * past, or someone already holds a class in it (move or cancel that one first, so nobody is bumped silently). A day with no
 * weekly times takes a typed start time instead.
 */
export async function createOwnerReservation(adminId: string, input: CreateReservationInput): Promise<{ groupId: string; rows: number; when: string }> {
  const contactError = validateReservationContact(input);
  if (contactError) throw new ClassBookingError(contactError);
  const day = parseDay(input.date);
  if (!day) throw new ClassBookingError("Pick a date.");
  if (day.getTime() < todayBoundsEt().start.getTime() - 86_400_000) throw new ClassBookingError("That day has already passed.");

  const schedules = await prisma.classSchedule.findMany({ where: { active: true, dayOfWeek: day.getUTCDay() } });
  if (input.time) {
    if (schedules.length > 0) throw new ClassBookingError("That day has weekly times. Pick from its hours.");
    return createOffDayReservation(adminId, input, input.time);
  }
  if (schedules.length === 0) throw new ClassBookingError(`There are no classes on ${DAY_NAMES[day.getUTCDay()]}s. Type a start time to keep one anyway.`);

  const wanted =
    input.hours === null
      ? schedules.map((s) => ({ scheduleId: s.id, chunkIndex: null as number | null }))
      : input.hours.map((h) => ({ scheduleId: h.scheduleId, chunkIndex: h.chunkIndex as number | null }));
  if (wanted.length === 0) throw new ClassBookingError("Pick at least one hour, or the whole day.");
  for (const w of wanted) {
    const schedule = schedules.find((s) => s.id === w.scheduleId);
    if (!schedule) throw new ClassBookingError("One of those hours is not offered that day.");
    if (w.chunkIndex !== null && !chunksForSchedule(schedule)[w.chunkIndex]) throw new ClassBookingError("One of those hours does not exist.");
  }

  // Someone already booked inside what is being kept?
  const booked = await prisma.classBooking.findMany({
    where: { occurrenceDate: day, status: "SCHEDULED", scheduleId: { in: wanted.map((w) => w.scheduleId) } },
    select: { scheduleId: true, scheduledAt: true, student: { select: { name: true, email: true } } },
  });
  const clash = booked.find((b) =>
    wanted.some((w) => {
      if (w.scheduleId !== b.scheduleId) return false;
      if (w.chunkIndex === null) return true;
      const schedule = schedules.find((s) => s.id === w.scheduleId)!;
      return computeScheduledAt(schedule, day, chunksForSchedule(schedule)[w.chunkIndex]).getTime() === b.scheduledAt.getTime();
    }),
  );
  if (clash) {
    throw new ClassBookingError(`${clash.student.name ?? clash.student.email} already has a class then. Move or cancel it first.`);
  }

  const groupId = randomUUID();
  await prisma.ownerReservation.createMany({
    data: wanted.map((w) => ({
      groupId,
      scheduleId: w.scheduleId,
      occurrenceDate: day,
      chunkIndex: w.chunkIndex,
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone.trim(),
      note: input.note?.trim() || null,
      createdById: adminId,
    })),
  });
  // "Saturday, Nov 7 at 10:00 AM" / "Saturday, Nov 7 (the whole day)", for the email to the customer.
  const dayLabel = day.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric" });
  const times = wanted
    .filter((w) => w.chunkIndex !== null)
    .map((w) => {
      const schedule = schedules.find((s) => s.id === w.scheduleId)!;
      const chunk = chunksForSchedule(schedule)[w.chunkIndex!];
      return { sort: schedule.startTime, label: time12(addMinutesToHHmm(schedule.startTime, chunk.offsetMin)), min: chunk.offsetMin };
    })
    .sort((a, b) => (a.sort === b.sort ? a.min - b.min : a.sort.localeCompare(b.sort)))
    .map((t) => t.label);
  const when = input.hours === null ? `${dayLabel} (the whole day)` : `${dayLabel} at ${joinTimes(times)}`;
  return { groupId, rows: wanted.length, when };
}

/** One class kept at a typed start time on a day the studio does not usually teach (see CreateReservationInput.time). */
async function createOffDayReservation(adminId: string, input: CreateReservationInput, time: string): Promise<{ groupId: string; rows: number; when: string }> {
  const at = parseCustomTime(input.date, time);
  if (!at) throw new ClassBookingError("Type a real start time.");
  if (at.scheduledAt.getTime() <= Date.now()) throw new ClassBookingError("That time has already passed.");
  const span = CLASS_MINUTES * 60_000;
  const clash = await prisma.classBooking.findFirst({
    where: { status: "SCHEDULED", scheduledAt: { gt: new Date(at.scheduledAt.getTime() - span), lt: new Date(at.scheduledAt.getTime() + span) } },
    select: { student: { select: { name: true, email: true } } },
  });
  if (clash) throw new ClassBookingError(`${clash.student.name ?? clash.student.email} already has a class then. Move or cancel it first.`);
  const kept = await prisma.ownerReservation.findMany({ where: { releasedAt: null, occurrenceDate: at.occurrenceDate, schedule: { label: ONE_OFF_LABEL } }, include: { schedule: true } });
  const taken = kept.find((r) => classesOverlap(computeScheduledAt(r.schedule, at.occurrenceDate, chunksForSchedule(r.schedule)[0]), at.scheduledAt));
  if (taken) throw new ClassBookingError(`That time is already kept for ${taken.name}.`);

  const schedule = await oneOffScheduleFor(prisma, at.occurrenceDate, at.startTime);
  const groupId = randomUUID();
  await prisma.ownerReservation.create({
    data: {
      groupId,
      scheduleId: schedule.id,
      occurrenceDate: at.occurrenceDate,
      chunkIndex: 0,
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone.trim(),
      note: input.note?.trim() || null,
      createdById: adminId,
    },
  });
  const dayLabel = at.occurrenceDate.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric" });
  return { groupId, rows: 1, when: `${dayLabel} at ${time12(at.startTime)}` };
}

export async function releaseOwnerReservation(groupId: string): Promise<number> {
  const result = await prisma.ownerReservation.updateMany({ where: { groupId, releasedAt: null }, data: { releasedAt: new Date() } });
  return result.count;
}

export interface ReservationGroup {
  groupId: string;
  /** "Tuesday, Nov 3" */
  dayLabel: string;
  dateMs: number;
  /** "Whole day" or "4:00 PM, 5:00 PM" */
  what: string;
  name: string;
  email: string;
  phone: string;
  note: string | null;
  /** Whether the customer can claim it yet: no account, an account whose email is not verified, or a verified one. */
  account: "none" | "unverified" | "verified";
  /** The customer's account when its email is verified, so the studio can book them straight into a kept hour ("Book it"). */
  accountId: string | null;
  /** Each hour it keeps that is still ahead, soonest first, for "Book it". */
  hours: ReservedHour[];
  /** The customer has already booked a class in it. */
  booked: boolean;
}

export interface ReservedHour {
  scheduleId: string;
  chunkIndex: number;
  /** "4:00 PM" */
  time: string;
  scheduledAtMs: number;
}

/** The live reservations from today on, one entry per reservation made. */
export async function listOwnerReservations(): Promise<ReservationGroup[]> {
  const rows = await prisma.ownerReservation.findMany({
    where: { releasedAt: null, occurrenceDate: { gte: new Date(todayBoundsEt().start.getTime() - 86_400_000) } },
    include: { schedule: true },
    orderBy: { occurrenceDate: "asc" },
  });
  const emails = [...new Set(rows.map((r) => r.email))];
  const accounts = emails.length
    ? await prisma.user.findMany({
        where: { OR: emails.map((e) => ({ email: { equals: e, mode: "insensitive" as const } })) },
        select: { id: true, email: true, emailVerified: true },
      })
    : [];
  const accountFor = (email: string) => accounts.find((a) => a.email.toLowerCase() === email.toLowerCase());
  const verifiedIds = accounts.filter((a) => a.emailVerified).map((a) => a.id);
  const booked = verifiedIds.length
    ? await prisma.classBooking.findMany({
        where: { studentId: { in: verifiedIds }, status: "SCHEDULED", occurrenceDate: { in: [...new Set(rows.map((r) => r.occurrenceDate))] }, scheduleId: { in: [...new Set(rows.map((r) => r.scheduleId))] } },
        select: { studentId: true, scheduleId: true, occurrenceDate: true },
      })
    : [];
  const groups = new Map<string, ReservationGroup & { times: string[]; whole: boolean }>();
  const now = Date.now();
  for (const r of rows) {
    let g = groups.get(r.groupId);
    if (!g) {
      const account = accountFor(r.email);
      g = {
        groupId: r.groupId,
        dayLabel: r.occurrenceDate.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric" }),
        dateMs: r.occurrenceDate.getTime(),
        what: "",
        name: r.name,
        email: r.email,
        phone: r.phone,
        note: r.note,
        account: !account ? "none" : account.emailVerified ? "verified" : "unverified",
        accountId: account?.emailVerified ? account.id : null,
        hours: [],
        booked: false,
        times: [],
        whole: false,
      };
      groups.set(r.groupId, g);
    }
    const owner = accountFor(r.email);
    if (owner?.emailVerified && booked.some((b) => b.studentId === owner.id && b.scheduleId === r.scheduleId && b.occurrenceDate.getTime() === r.occurrenceDate.getTime())) g.booked = true;
    if (r.chunkIndex === null) g.whole = true;
    else {
      const chunk = chunksForSchedule(r.schedule)[r.chunkIndex];
      if (chunk) g.times.push(time12(addMinutesToHHmm(r.schedule.startTime, chunk.offsetMin)));
    }
    for (const chunk of chunksForSchedule(r.schedule).filter((c) => r.chunkIndex === null || c.chunkIndex === r.chunkIndex)) {
      const at = computeScheduledAt(r.schedule, r.occurrenceDate, chunk).getTime();
      if (at > now) g.hours.push({ scheduleId: r.scheduleId, chunkIndex: chunk.chunkIndex, time: time12(addMinutesToHHmm(r.schedule.startTime, chunk.offsetMin)), scheduledAtMs: at });
    }
  }
  return [...groups.values()].map(({ times, whole, ...g }) => ({ ...g, hours: g.hours.sort((a, b) => a.scheduledAtMs - b.scheduledAtMs), what: whole ? "Whole day" : times.join(", ") }));
}

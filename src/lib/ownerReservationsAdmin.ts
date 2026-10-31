import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { chunksForSchedule, ClassBookingError, computeScheduledAt, todayBoundsEt } from "@/lib/classSchedule";
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
  /** null = the whole day (every window); otherwise just these hours. */
  hours: { scheduleId: string; chunkIndex: number }[] | null;
}

/**
 * Keeps a day, or some hours of it, for a named customer. Nobody can book it until it is released. Refused when the day is
 * past, has no classes, or someone already holds a class in it (move or cancel that one first, so nobody is bumped silently).
 */
export async function createOwnerReservation(adminId: string, input: CreateReservationInput): Promise<{ groupId: string; rows: number; when: string }> {
  const contactError = validateReservationContact(input);
  if (contactError) throw new ClassBookingError(contactError);
  const day = parseDay(input.date);
  if (!day) throw new ClassBookingError("Pick a date.");
  if (day.getTime() < todayBoundsEt().start.getTime() - 86_400_000) throw new ClassBookingError("That day has already passed.");

  const schedules = await prisma.classSchedule.findMany({ where: { active: true, dayOfWeek: day.getUTCDay() } });
  if (schedules.length === 0) throw new ClassBookingError(`There are no classes on ${DAY_NAMES[day.getUTCDay()]}s.`);

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
  /** The customer has already booked a class in it. */
  booked: boolean;
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
  for (const r of rows) {
    let g = groups.get(r.groupId);
    if (!g) {
      g = {
        groupId: r.groupId,
        dayLabel: r.occurrenceDate.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric" }),
        dateMs: r.occurrenceDate.getTime(),
        what: "",
        name: r.name,
        email: r.email,
        phone: r.phone,
        note: r.note,
        account: !accountFor(r.email) ? "none" : accountFor(r.email)!.emailVerified ? "verified" : "unverified",
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
  }
  return [...groups.values()].map(({ times, whole, ...g }) => ({ ...g, what: whole ? "Whole day" : times.join(", ") }));
}

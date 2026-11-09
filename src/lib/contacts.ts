import type { ContactStatus, PrimaryInstrument, SkillLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { chunksForSchedule } from "@/lib/classSchedule";
import { parseDay } from "@/lib/slotHolds";
import { addMinutesToHHmm } from "@/lib/classScheduleLabels";

/** People the teacher keeps track of who do not have an account, plus soft holds on weekly times and a log of days they took a class. */

export class ContactError extends Error {}

const STATUSES: ContactStatus[] = ["INTERESTED", "TRIAL", "ACTIVE", "PAUSED"];
const INSTRUMENTS: PrimaryInstrument[] = ["PIANO_KEYBOARD", "BASS", "GUITAR", "DRUMS", "VOCAL", "OTHER"];
const LEVELS: SkillLevel[] = ["BEGINNER", "INTERMEDIATE", "ADVANCED"];

export interface ContactInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  instrument?: string | null;
  skillLevel?: string | null;
  source?: string | null;
  notes?: string | null;
  status?: string | null;
}

function clean(value: string | null | undefined, max: number, label: string): string | null {
  const text = (value ?? "").trim();
  if (!text) return null;
  if (text.length > max) throw new ContactError(`${label} is too long (${max} characters at most).`);
  return text;
}

function parseContact(input: ContactInput) {
  const name = (input.name ?? "").trim();
  if (!name) throw new ContactError("Enter a name.");
  if (name.length > 120) throw new ContactError("The name is too long.");
  const email = clean(input.email, 200, "The email")?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ContactError("That email does not look right.");
  const instrument = (clean(input.instrument, 40, "The instrument") as PrimaryInstrument | null) ?? null;
  if (instrument && !INSTRUMENTS.includes(instrument)) throw new ContactError("Pick an instrument from the list.");
  const skillLevel = (clean(input.skillLevel, 40, "The level") as SkillLevel | null) ?? null;
  if (skillLevel && !LEVELS.includes(skillLevel)) throw new ContactError("Pick a level from the list.");
  const status = ((input.status ?? "").trim() || "INTERESTED") as ContactStatus;
  if (!STATUSES.includes(status)) throw new ContactError("Pick a status from the list.");
  return {
    name,
    phone: clean(input.phone, 40, "The phone number"),
    email,
    instrument,
    skillLevel,
    source: clean(input.source, 120, "The source"),
    notes: clean(input.notes, 4000, "The notes"),
    status,
  };
}

export async function createContact(input: ContactInput) {
  return prisma.contact.create({ data: parseContact(input) });
}

export async function updateContact(contactId: string, input: ContactInput) {
  const exists = await prisma.contact.findUnique({ where: { id: contactId }, select: { id: true } });
  if (!exists) throw new ContactError("That person was not found.");
  return prisma.contact.update({ where: { id: contactId }, data: parseContact(input) });
}

export async function deleteContact(contactId: string): Promise<void> {
  await prisma.contact.deleteMany({ where: { id: contactId } });
}

/** One day, as stored (UTC midnight) and as the calendar day it names. */
function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function listContacts(query = "") {
  const q = query.trim();
  const rows = await prisma.contact.findMany({
    where: q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 300,
    include: {
      holds: { where: { releasedAt: null }, select: { until: true } },
      sessions: { orderBy: { date: "desc" }, take: 1, select: { date: true } },
      _count: { select: { sessions: true } },
    },
  });
  const today = todayUtc().getTime();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    instrument: row.instrument,
    status: row.status,
    activeHolds: row.holds.filter((hold) => !hold.until || hold.until.getTime() >= today).length,
    sessionCount: row._count.sessions,
    lastSession: row.sessions[0]?.date ?? null,
    createdAt: row.createdAt,
  }));
}

export async function getContact(contactId: string) {
  return prisma.contact.findUnique({
    where: { id: contactId },
    include: {
      holds: { orderBy: { createdAt: "desc" }, include: { schedule: { select: { id: true, dayOfWeek: true, startTime: true, durationMin: true, label: true } } } },
      sessions: { orderBy: { date: "desc" } },
    },
  });
}

export async function addHold(contactId: string, scheduleId: string, chunkIndex: number, untilRaw: string | null, note: string | null) {
  const [contact, schedule] = await Promise.all([
    prisma.contact.findUnique({ where: { id: contactId }, select: { id: true } }),
    prisma.classSchedule.findUnique({ where: { id: scheduleId }, select: { id: true, durationMin: true, active: true } }),
  ]);
  if (!contact) throw new ContactError("That person was not found.");
  if (!schedule || !schedule.active) throw new ContactError("That weekly time is not available.");
  if (!Number.isInteger(chunkIndex) || !chunksForSchedule(schedule)[chunkIndex]) throw new ContactError("Pick one of the hours in that window.");
  let until: Date | null = null;
  if (untilRaw && untilRaw.trim()) {
    until = parseDay(untilRaw.trim());
    if (!until) throw new ContactError("Enter the last date as a real date.");
    if (until.getTime() < todayUtc().getTime()) throw new ContactError("The last date is already past.");
  }
  return prisma.slotHold.create({ data: { contactId, scheduleId, chunkIndex, until, note: clean(note, 300, "The note") } });
}

export async function releaseHold(holdId: string): Promise<void> {
  await prisma.slotHold.updateMany({ where: { id: holdId, releasedAt: null }, data: { releasedAt: new Date() } });
}

export async function addSession(contactId: string, dayRaw: string, attended: boolean, note: string | null) {
  const date = parseDay((dayRaw ?? "").trim());
  if (!date) throw new ContactError("Enter the day as a real date.");
  const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { id: true } });
  if (!contact) throw new ContactError("That person was not found.");
  return prisma.contactSession.create({ data: { contactId, date, attended, note: clean(note, 300, "The note") } });
}

export async function deleteSession(sessionId: string): Promise<void> {
  await prisma.contactSession.deleteMany({ where: { id: sessionId } });
}

export interface ActiveHold {
  holdId: string;
  contactId: string;
  contactName: string;
  scheduleId: string;
  chunkIndex: number;
  /** Last date it applies to, as milliseconds at UTC midnight, or null. */
  untilMs: number | null;
}

/** Every hold that still applies from today on, for the admin booking screen to warn about. */
export async function getActiveHolds(): Promise<ActiveHold[]> {
  const today = todayUtc();
  const rows = await prisma.slotHold.findMany({
    where: { releasedAt: null, OR: [{ until: null }, { until: { gte: today } }] },
    include: { contact: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => ({
    holdId: row.id,
    contactId: row.contact.id,
    contactName: row.contact.name,
    scheduleId: row.scheduleId,
    chunkIndex: row.chunkIndex,
    untilMs: row.until ? row.until.getTime() : null,
  }));
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function time12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export interface HoldChoice {
  scheduleId: string;
  chunkIndex: number;
  label: string;
}

/** Every weekly hour that can be held, named the way the teacher thinks of it ("Monday 4:00 PM"). */
export async function getHoldChoices(): Promise<HoldChoice[]> {
  const schedules = await prisma.classSchedule.findMany({ where: { active: true }, orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] });
  return schedules.flatMap((schedule) =>
    chunksForSchedule(schedule).map((chunk) => ({
      scheduleId: schedule.id,
      chunkIndex: chunk.chunkIndex,
      label: `${DAY_NAMES[schedule.dayOfWeek]} ${time12(addMinutesToHHmm(schedule.startTime, chunk.offsetMin))}${schedule.label ? ` · ${schedule.label}` : ""}`,
    })),
  );
}

export type PersonKind = "ACCOUNT" | "APPLICATION" | "ADDED";

export interface DirectoryRow {
  key: string;
  kind: PersonKind;
  name: string;
  email: string | null;
  phone: string | null;
  /** Instrument for contacts and applications; empty for accounts. */
  detail: string | null;
  /** Status in the person's own list (an application's review state, a contact's stage). */
  status: string | null;
  href: string;
  classesTaken: number;
  lastClass: Date | null;
  nextClass: Date | null;
  /** The weekly time kept for them: a plan's reserved hour, or the contact's holds. */
  reserved: string | null;
}

/**
 * Everyone the teacher deals with, in one list: accounts (with the classes they took and booked and any reserved
 * weekly time), people who applied through the form and have no account yet, and people added by hand.
 */
export async function listDirectory(query = "", kind: PersonKind | "ALL" = "ALL"): Promise<DirectoryRow[]> {
  const q = query.trim();
  const choices = await getHoldChoices();
  const slotLabel = (scheduleId: string | null, chunk: number | null) =>
    scheduleId === null || chunk === null ? null : (choices.find((c) => c.scheduleId === scheduleId && c.chunkIndex === chunk)?.label ?? null);
  const like = q ? { contains: q, mode: "insensitive" as const } : undefined;
  const rows: DirectoryRow[] = [];
  const accountEmails = new Set<string>();

  if (kind === "ALL" || kind === "ACCOUNT") {
    const users = await prisma.user.findMany({
      where: { role: "STUDENT", ...(like ? { OR: [{ name: like }, { email: like }, { phone: { contains: q } }] } : {}) },
      select: { id: true, name: true, email: true, phone: true },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    const ids = users.map((u) => u.id);
    const [bookings, plans] = await Promise.all([
      prisma.classBooking.findMany({ where: { studentId: { in: ids }, status: { not: "CANCELED" } }, select: { studentId: true, scheduledAt: true, attendance: true } }),
      prisma.paymentPlan.findMany({ where: { userId: { in: ids }, status: "ACTIVE", reservedScheduleId: { not: null } }, select: { userId: true, reservedScheduleId: true, reservedChunkIndex: true } }),
    ]);
    const now = Date.now();
    for (const user of users) {
      accountEmails.add(user.email.toLowerCase());
      const mine = bookings.filter((b) => b.studentId === user.id);
      const taken = mine.filter((b) => b.attendance === "PRESENT");
      const upcoming = mine.filter((b) => b.scheduledAt.getTime() > now && b.attendance === null).map((b) => b.scheduledAt.getTime());
      const plan = plans.find((p) => p.userId === user.id);
      rows.push({
        key: `account:${user.id}`,
        kind: "ACCOUNT",
        name: user.name ?? user.email,
        email: user.email,
        phone: user.phone,
        detail: null,
        status: null,
        href: `/admin/users/${user.id}`,
        classesTaken: taken.length,
        lastClass: taken.length ? new Date(Math.max(...taken.map((b) => b.scheduledAt.getTime()))) : null,
        nextClass: upcoming.length ? new Date(Math.min(...upcoming)) : null,
        reserved: plan ? slotLabel(plan.reservedScheduleId, plan.reservedChunkIndex) : null,
      });
    }
  }

  if (kind === "ALL" || kind === "APPLICATION") {
    const applications = await prisma.classRegistration.findMany({
      where: { status: { not: "REJECTED" }, ...(like ? { OR: [{ fullName: like }, { email: like }, { phone: { contains: q } }] } : {}) },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const emails = await prisma.user.findMany({ where: { email: { in: applications.map((a) => a.email) } }, select: { email: true } });
    for (const e of emails) accountEmails.add(e.email.toLowerCase());
    for (const app of applications) {
      // Someone who already has an account is listed once, as that account.
      if (accountEmails.has(app.email.toLowerCase())) continue;
      rows.push({
        key: `application:${app.id}`,
        kind: "APPLICATION",
        name: app.fullName,
        email: app.email,
        phone: app.phone,
        detail: app.instrument,
        status: app.status,
        // Opens the tab they are on (Applicants opens on Pending, where an approved one is not listed), searched to them.
        href: `/admin/students?status=${app.status}&q=${encodeURIComponent(app.email)}`,
        classesTaken: 0,
        lastClass: null,
        nextClass: null,
        reserved: null,
      });
    }
  }

  if (kind === "ALL" || kind === "ADDED") {
    const added = await listContacts(q);
    for (const c of added) {
      rows.push({
        key: `added:${c.id}`,
        kind: "ADDED",
        name: c.name,
        email: c.email,
        phone: c.phone,
        detail: c.instrument,
        status: c.status,
        href: `/admin/contacts/${c.id}`,
        classesTaken: c.sessionCount,
        lastClass: c.lastSession,
        nextClass: null,
        reserved: c.activeHolds > 0 ? `${c.activeHolds} reserved` : null,
      });
    }
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

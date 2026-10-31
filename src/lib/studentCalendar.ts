import { createHmac, timingSafeEqual } from "crypto";

/**
 * A student's personal calendar feed. Calendar apps cannot sign in, so the link carries a secret: an HMAC of the account id and
 * its `calendarVersion`, derived from the app secret (nothing stored). "Make a new link" bumps the version and the old one dies.
 */
export function studentCalendarToken(userId: string, version: number): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set");
  return createHmac("sha256", secret).update(`student-calendar-v1:${userId}:${version}`).digest("hex").slice(0, 40);
}

export function isValidStudentCalendarToken(userId: string, version: number, candidate: string): boolean {
  try {
    const expected = Buffer.from(studentCalendarToken(userId, version));
    const given = Buffer.from(candidate);
    return given.length === expected.length && timingSafeEqual(given, expected);
  } catch {
    return false;
  }
}

export function studentCalendarUrls(userId: string, version: number, origin: string): { https: string; webcal: string } {
  const base = origin.replace(/\/$/, "");
  const path = `/api/calendar/me?u=${encodeURIComponent(userId)}&t=${studentCalendarToken(userId, version)}`;
  return { https: `${base}${path}`, webcal: `${base.replace(/^https?:\/\//, "webcal://")}${path}` };
}

const stampOf = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escapeText = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

export interface FeedClass {
  id: string;
  scheduledAt: Date;
  minutes: number;
}

/** The .ics text for a student's upcoming classes. A class that was canceled is simply absent, so calendar apps drop it on refresh. */
export function buildStudentIcs(classes: FeedClass[], discordUrl: string, now: Date): string {
  const events = classes.flatMap((c) => [
    "BEGIN:VEVENT",
    `UID:${c.id}@bassnotepiano.com`,
    `DTSTAMP:${stampOf(now)}`,
    `DTSTART:${stampOf(c.scheduledAt)}`,
    `DTEND:${stampOf(new Date(c.scheduledAt.getTime() + c.minutes * 60_000))}`,
    "SUMMARY:Bass Note Piano live class",
    `DESCRIPTION:${escapeText(`Join your teacher on Discord: ${discordUrl}`)}`,
    `URL:${discordUrl}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Class starts in 15 minutes",
    "TRIGGER:-PT15M",
    "END:VALARM",
    "END:VEVENT",
  ]);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bass Note Piano//Student calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:My Bass Note Piano classes",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

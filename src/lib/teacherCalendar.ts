import { createHmac, timingSafeEqual } from "crypto";

/**
 * The teacher's calendar feed is a link a calendar app polls, and calendar
 * apps cannot sign in, so the link carries a secret instead. It is derived
 * from the app secret, so it never needs storing and changes if that does.
 */
export function teacherCalendarToken(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set");
  return createHmac("sha256", secret).update("teacher-calendar-v1").digest("hex").slice(0, 40);
}

export function isValidTeacherCalendarToken(candidate: string): boolean {
  try {
    const expected = Buffer.from(teacherCalendarToken());
    const given = Buffer.from(candidate);
    return given.length === expected.length && timingSafeEqual(given, expected);
  } catch {
    return false;
  }
}

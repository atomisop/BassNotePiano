import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * The teacher's calendar feed is a link a calendar app polls, and calendar
 * apps cannot sign in, so the link carries a secret instead. It is derived
 * from the app secret and a version number kept in settings, so it never needs
 * storing, and "Make a new link" (rotateTeacherCalendarVersion) kills the old
 * one without touching the app secret (which would sign everyone out).
 * Version 0 is the original link, so existing subscriptions keep working until rotated.
 */
const VERSION_KEY = "calendar.teacherVersion";

export function teacherCalendarToken(version = 0): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set");
  const label = version > 0 ? `teacher-calendar-v1:${version}` : "teacher-calendar-v1";
  return createHmac("sha256", secret).update(label).digest("hex").slice(0, 40);
}

export function isValidTeacherCalendarToken(candidate: string, version = 0): boolean {
  try {
    const expected = Buffer.from(teacherCalendarToken(version));
    const given = Buffer.from(candidate);
    return given.length === expected.length && timingSafeEqual(given, expected);
  } catch {
    return false;
  }
}

export async function currentTeacherCalendarVersion(): Promise<number> {
  const row = await prisma.appSetting.findUnique({ where: { key: VERSION_KEY }, select: { value: true } });
  const n = Number(row?.value ?? 0);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** Makes the old calendar link stop working; the next link shown is new. */
export async function rotateTeacherCalendarVersion(): Promise<number> {
  const next = (await currentTeacherCalendarVersion()) + 1;
  await prisma.appSetting.upsert({ where: { key: VERSION_KEY }, create: { key: VERSION_KEY, value: String(next) }, update: { value: String(next) } });
  return next;
}

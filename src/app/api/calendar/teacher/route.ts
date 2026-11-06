import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentTeacherCalendarVersion, isValidTeacherCalendarToken } from "@/lib/teacherCalendar";

// The teacher's classes as a calendar feed. Calendar apps poll this link, so
// it is protected by a secret in the link rather than a sign-in.

const CLASS_MINUTES = 45;

function stampOf(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "");
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  if (!isValidTeacherCalendarToken(token, await currentTeacherCalendarVersion())) return new NextResponse("Not found", { status: 404 });

  const now = new Date();
  const bookings = await prisma.classBooking.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { gte: new Date(now.getTime() - 86_400_000), lte: new Date(now.getTime() + 120 * 86_400_000) },
    },
    orderBy: { scheduledAt: "asc" },
    select: { id: true, scheduledAt: true, creditsSpent: true, student: { select: { name: true, email: true } } },
  });

  const events = bookings.flatMap((b) => {
    const minutes = CLASS_MINUTES * Math.max(1, Math.floor(b.creditsSpent / 2));
    const end = new Date(b.scheduledAt.getTime() + minutes * 60_000);
    return [
      "BEGIN:VEVENT",
      `UID:${b.id}@bassnotepiano.com`,
      `DTSTAMP:${stampOf(now)}`,
      `DTSTART:${stampOf(b.scheduledAt)}`,
      `DTEND:${stampOf(end)}`,
      `SUMMARY:${escapeText(`Class: ${b.student.name ?? b.student.email}`)}`,
      `DESCRIPTION:${escapeText(b.student.email)}`,
      "END:VEVENT",
    ];
  });

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bass Note Piano//Teacher calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Bass Note Piano classes",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  return new NextResponse(ics, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300" },
  });
}

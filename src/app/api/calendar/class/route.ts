import { NextResponse } from "next/server";

// "Add to calendar" for a booked live class. Only a start time and a length
// come from the link, and both are checked, so nothing else can be written
// into the file.

function stampOf(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const start = new Date(url.searchParams.get("s") ?? "");
  const minutes = Number(url.searchParams.get("m") ?? "45");
  if (Number.isNaN(start.getTime()) || !Number.isInteger(minutes) || minutes < 5 || minutes > 240) {
    return new NextResponse("Bad request", { status: 400 });
  }
  const end = new Date(start.getTime() + minutes * 60_000);
  const discord = "https://discord.gg/bGKxhAN6U";

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bass Note Piano//Live class//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${stampOf(start)}-class@bassnotepiano.com`,
    `DTSTAMP:${stampOf(new Date())}`,
    `DTSTART:${stampOf(start)}`,
    `DTEND:${stampOf(end)}`,
    "SUMMARY:Bass Note Piano live class",
    `DESCRIPTION:Join your teacher on Discord: ${discord}`,
    `URL:${discord}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Class starts in 15 minutes",
    "TRIGGER:-PT15M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="bass-note-piano-class.ics"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}

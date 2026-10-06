import { NextResponse } from "next/server";

// The "Remind me" button in the bill email lands here and gets a calendar
// file back, so the phone or computer opens its own calendar to add it. Only
// a due date and an amount come from the link, and they are checked, so
// nothing else can be written into the file.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const d = url.searchParams.get("d") ?? "";
  const cents = Number(url.searchParams.get("a"));
  const due = DATE_RE.test(d) ? new Date(`${d}T00:00:00Z`) : null;
  if (!due || Number.isNaN(due.getTime()) || !Number.isInteger(cents) || cents <= 0 || cents > 10_000_000) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const amount = (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  const next = new Date(due.getTime() + 86_400_000);
  const payUrl = `${process.env.NEXTAUTH_URL ?? ""}/billing/plans`;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const summary = `Bass Note Piano payment due, ${amount}`;
  const description = `Pay your Bass Note Piano installment: ${payUrl}`;

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bass Note Piano//Payment reminder//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${ymd(due)}-${cents}@bassnotepiano.com`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(due)}`,
    `DTEND;VALUE=DATE:${ymd(next)}`,
    `SUMMARY:${summary.replace(/,/g, "\\,")}`,
    `DESCRIPTION:${description.replace(/,/g, "\\,")}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Payment due tomorrow",
    "TRIGGER:-PT15H",
    "END:VALARM",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Payment due today",
    "TRIGGER:PT9H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="bass-note-piano-payment.ics"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}

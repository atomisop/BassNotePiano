import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DISCORD_INVITE_URL } from "@/lib/discord";
import { buildStudentIcs, isValidStudentCalendarToken } from "@/lib/studentCalendar";

export const dynamic = "force-dynamic";

const CLASS_MINUTES = 45;
const notFound = () => new NextResponse("Not found", { status: 404 });

/** One student's upcoming classes as a calendar feed. Protected by the signed link (see studentCalendar.ts), not a sign-in. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = (url.searchParams.get("u") ?? "").slice(0, 64);
  const token = url.searchParams.get("t") ?? "";
  if (!userId || !token) return notFound();

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { calendarVersion: true, bannedAt: true } });
  if (!user || user.bannedAt || !isValidStudentCalendarToken(userId, user.calendarVersion, token)) return notFound();

  const now = new Date();
  const bookings = await prisma.classBooking.findMany({
    where: { studentId: userId, status: "SCHEDULED", scheduledAt: { gte: new Date(now.getTime() - 86_400_000), lte: new Date(now.getTime() + 120 * 86_400_000) } },
    orderBy: { scheduledAt: "asc" },
    select: { id: true, scheduledAt: true, creditsSpent: true },
  });
  const ics = buildStudentIcs(
    bookings.map((b) => ({ id: b.id, scheduledAt: b.scheduledAt, minutes: CLASS_MINUTES * Math.max(1, Math.floor(b.creditsSpent / 2)) })),
    DISCORD_INVITE_URL,
    now,
  );
  return new NextResponse(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300" } });
}

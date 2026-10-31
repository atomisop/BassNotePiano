import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { studentCalendarUrls } from "@/lib/studentCalendar";

export const dynamic = "force-dynamic";
const H = { "Cache-Control": "no-store" };

async function linkFor(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { calendarVersion: true } });
  if (!user) return null;
  const origin = process.env.NEXTAUTH_URL || "http://localhost:3000";
  return studentCalendarUrls(userId, user.calendarVersion, origin);
}

/** The signed-in person's calendar feed links. */
export async function GET() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: H });
  const links = await linkFor(session.user.id);
  return NextResponse.json({ links }, { headers: H });
}

/** Makes a new link: the old one stops working at once. */
export async function POST() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: H });
  await prisma.user.update({ where: { id: session.user.id }, data: { calendarVersion: { increment: 1 } } });
  await logAudit({ actorId: session.user.id, action: "calendar.reset", targetType: "User", targetId: session.user.id, detail: "Made a new calendar link" });
  return NextResponse.json({ links: await linkFor(session.user.id) }, { headers: H });
}

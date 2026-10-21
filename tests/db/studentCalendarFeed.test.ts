import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { canonicalEmail } from "@/lib/canonicalEmail";
import { GET } from "@/app/api/calendar/me/route";
import { studentCalendarToken } from "@/lib/studentCalendar";
import { newTag, prisma } from "./helpers";

const tag = newTag("cf");
const ids: string[] = [];
let slotId = "";

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = "test-secret";
});
afterAll(async () => {
  await prisma.classBooking.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.classSchedule.deleteMany({ where: { id: slotId } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

async function mkUser(label: string) {
  const email = `${tag}-${label}@example.test`;
  const u = await prisma.user.create({ data: { email, name: "Feed Tester", passwordHash: "x", emailCanonical: canonicalEmail(email) } });
  ids.push(u.id);
  return u;
}
const call = (id: string, t: string) => GET(new Request(`https://x/api/calendar/me?u=${id}&t=${t}`));

describe("personal calendar feed", () => {
  it("lists only this student's scheduled classes, and rejects wrong, rotated and banned links", async () => {
    const a = await mkUser("a");
    const b = await mkUser("b");
    const slot = await prisma.classSchedule.create({ data: { dayOfWeek: 2, startTime: "11:00", durationMin: 45, creditCost: 2, label: `${tag} slot` } });
    slotId = slot.id;
    const when = new Date(Date.now() + 5 * 86_400_000);
    const mk = (studentId: string, day: number, status: "SCHEDULED" | "CANCELED") =>
      prisma.classBooking.create({ data: { studentId, scheduleId: slot.id, occurrenceDate: new Date(Date.UTC(2031, 1, day)), scheduledAt: new Date(when.getTime() + day * 3_600_000), status, creditsSpent: 2 } });
    const mine = await mk(a.id, 1, "SCHEDULED");
    const canceled = await mk(a.id, 2, "CANCELED");
    const theirs = await mk(b.id, 3, "SCHEDULED");

    const ok = await call(a.id, studentCalendarToken(a.id, 0));
    expect(ok.status).toBe(200);
    const text = await ok.text();
    expect(text).toContain(mine.id);
    expect(text).not.toContain(canceled.id);
    expect(text).not.toContain(theirs.id);

    expect((await call(a.id, studentCalendarToken(b.id, 0))).status).toBe(404);
    await prisma.user.update({ where: { id: a.id }, data: { calendarVersion: { increment: 1 } } });
    expect((await call(a.id, studentCalendarToken(a.id, 0))).status).toBe(404);
    expect((await call(a.id, studentCalendarToken(a.id, 1))).status).toBe(200);
    await prisma.user.update({ where: { id: a.id }, data: { bannedAt: new Date() } });
    expect((await call(a.id, studentCalendarToken(a.id, 1))).status).toBe(404);
  });
});

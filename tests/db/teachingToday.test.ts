import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { getTeachingDay } from "@/lib/teachingToday";
import { etDayKey } from "@/lib/fingerPractice";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("td");
const ids: string[] = [];
let slotId = "";

afterAll(async () => {
  await prisma.studentNote.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.classBooking.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: ids } } });
  await prisma.classSchedule.deleteMany({ where: { id: slotId } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("getTeachingDay", () => {
  it("groups today's classes by start time and carries what the teacher needs", async () => {
    // A fixed instant mid-afternoon Eastern, so "today" is unambiguous whatever time the test runs.
    const now = new Date("2031-03-12T19:00:00Z");
    const a = await makeUser(tag, "Ann Today");
    const b = await makeUser(tag, "Ben Today", { discordId: "123", discordUsername: "ben#1" });
    const c = await makeUser(tag, "Cy Tomorrow");
    ids.push(a.id, b.id, c.id);
    const slot = await prisma.classSchedule.create({ data: { dayOfWeek: 3, startTime: "17:00", durationMin: 45, creditCost: 2, label: `${tag} slot` } });
    slotId = slot.id;
    await prisma.paymentPlan.create({
      data: { userId: b.id, cadence: "MIN_60_WEEKLY", term: "TERM_3", installmentAmountCents: 20000, creditsPerInstallment: 8, termMonths: 3, installmentsPaid: 1, nextDueDate: new Date("2031-03-01") },
    });
    await prisma.studentNote.create({ data: { studentId: b.id, body: "Working on the left hand." } });
    const mk = (studentId: string, at: string, day: number) =>
      prisma.classBooking.create({ data: { studentId, scheduleId: slot.id, occurrenceDate: new Date(Date.UTC(2031, 2, day)), scheduledAt: new Date(at), creditsSpent: 2 } });
    await mk(a.id, "2031-03-12T21:00:00Z", 12);
    await mk(b.id, "2031-03-12T21:00:00Z", 12);
    await mk(c.id, "2031-03-13T21:00:00Z", 13);

    const day = await getTeachingDay(now);
    expect(day.dayKey).toBe(etDayKey(now));
    expect(day.slots).toHaveLength(1);
    const names = day.slots[0].students.map((s) => s.name).sort();
    expect(names).toEqual(["Ann Today", "Ben Today"]);
    const ben = day.slots[0].students.find((s) => s.name === "Ben Today")!;
    expect(ben.discord.connected).toBe(true);
    expect(ben.planLabel).toBe("3-month");
    expect(ben.billOverdue).toBe(true);
    expect(ben.note?.body).toContain("left hand");
    expect(ben.firstClass).toBe(true);
    const ann = day.slots[0].students.find((s) => s.name === "Ann Today")!;
    expect(ann.planLabel).toBeNull();
    expect(ann.discord.connected).toBe(false);
  });
});

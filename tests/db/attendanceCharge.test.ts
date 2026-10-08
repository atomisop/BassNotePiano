import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { markAttendance } from "@/lib/classScheduleAdmin";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("at");
let student: { id: string }, slot: { id: string }, bookingId: string;

beforeAll(async () => {
  student = await makeUser(tag, "Charge Cora", { classCredits: 10 });
  slot = await prisma.classSchedule.create({ data: { dayOfWeek: 2, startTime: "10:00", durationMin: 60, creditCost: 2, label: `${tag} slot` } });
  const booking = await prisma.classBooking.create({
    data: { studentId: student.id, scheduleId: slot.id, occurrenceDate: new Date(Date.UTC(2026, 0, 6)), scheduledAt: new Date(Date.now() - 3_600_000), creditsSpent: 2 },
  });
  bookingId = booking.id;
});
afterAll(async () => {
  await prisma.classBooking.deleteMany({ where: { studentId: student.id } });
  await prisma.classSchedule.deleteMany({ where: { id: slot.id } });
  await prisma.user.deleteMany({ where: { id: student.id } });
});

describe("marking attendance charges once", () => {
  it("charges a single time even when two marks arrive together", async () => {
    await Promise.all([markAttendance(bookingId, "PRESENT"), markAttendance(bookingId, "PRESENT")]);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: student.id } })).classCredits).toBe(8);
  });
  it("lets a correction change the mark without charging again", async () => {
    await markAttendance(bookingId, "NO_SHOW");
    const after = await prisma.classBooking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(after.attendance).toBe("NO_SHOW");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: student.id } })).classCredits).toBe(8);
  });
});

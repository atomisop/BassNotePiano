import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { runAttendanceAutoCharge } from "@/lib/attendanceAutoCharge";
import { resetSetting, saveSetting } from "@/lib/siteSettings";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("aa");
const HOUR = 3_600_000;
let stu: { id: string }, slot: { id: string };
const bookings: Record<string, string> = {};

beforeAll(async () => {
  await resetSetting("attendance.autoChargeHours");
  stu = await makeUser(tag, "Unmarked Una", { classCredits: 20 });
  slot = await prisma.classSchedule.create({ data: { dayOfWeek: 2, startTime: "10:00", durationMin: 45, creditCost: 2, label: `${tag} slot` } });
  const mk = async (name: string, hoursAgo: number, day: number) => {
    const b = await prisma.classBooking.create({ data: { studentId: stu.id, scheduleId: slot.id, occurrenceDate: new Date(Date.UTC(2031, 6, day)), scheduledAt: new Date(Date.now() - hoursAgo * HOUR), creditsSpent: 2 } });
    bookings[name] = b.id;
  };
  await mk("old", 60, 1); // well past the 48 hour default
  await mk("recent", 5, 2); // not due yet
  await mk("future", -48, 3);
});
afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: stu.id } });
  await prisma.classBooking.deleteMany({ where: { studentId: stu.id } });
  await prisma.classSchedule.deleteMany({ where: { id: slot.id } });
  await prisma.user.deleteMany({ where: { id: stu.id } });
});

describe("runAttendanceAutoCharge", () => {
  it("charges a class nobody marked once it is long past, and leaves recent and future ones alone", async () => {
    await runAttendanceAutoCharge(new Date());
    const row = (id: string) => prisma.classBooking.findUniqueOrThrow({ where: { id } });
    const old = await row(bookings.old);
    expect(old.status).toBe("COMPLETED");
    expect(old.attendance).toBe("PRESENT");
    expect((await row(bookings.recent)).status).toBe("SCHEDULED");
    expect((await row(bookings.future)).status).toBe("SCHEDULED");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: stu.id } })).classCredits).toBe(18);
  });

  it("charges only once however many times it runs", async () => {
    await runAttendanceAutoCharge(new Date());
    await runAttendanceAutoCharge(new Date());
    expect((await prisma.user.findUniqueOrThrow({ where: { id: stu.id } })).classCredits).toBe(18);
  });

  it("does nothing at all when the owner sets it to 0", async () => {
    await saveSetting("attendance.autoChargeHours", 0);
    try {
      const r = await runAttendanceAutoCharge(new Date(Date.now() + 100 * HOUR)); // everything would be due
      expect(r).toEqual({ charged: 0, warned: 0 });
      expect((await prisma.classBooking.findUniqueOrThrow({ where: { id: bookings.recent } })).status).toBe("SCHEDULED");
    } finally {
      await resetSetting("attendance.autoChargeHours");
    }
  });
});

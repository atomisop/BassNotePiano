import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { canonicalEmail } from "@/lib/canonicalEmail";
import { cancelUpcomingClasses, closeStudioDay, previewClosedDay, CLOSED_NAME } from "@/lib/adminClassTools";
import { newTag, prisma } from "./helpers";

const tag = newTag("act");
const DAY = 86_400_000;
const emails: string[] = [];
const slotIds: string[] = [];

async function account(label: string, role: "STUDENT" | "ADMIN" = "STUDENT") {
  const email = `${tag}-${label}-${emails.length}@example.test`;
  emails.push(email);
  return prisma.user.create({ data: { email, name: "Class Tester", passwordHash: "x", emailCanonical: canonicalEmail(email), role } });
}

/** A weekday slot far ahead (so no other test's classes share its day) and a booking on it. */
async function booked(studentId: string, daysAhead: number) {
  const at = new Date(Date.now() + daysAhead * DAY);
  const occurrenceDate = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const slot = await prisma.classSchedule.create({ data: { dayOfWeek: occurrenceDate.getUTCDay(), startTime: "10:00", durationMin: 45, creditCost: 2, label: tag } });
  slotIds.push(slot.id);
  await prisma.classBooking.create({ data: { studentId, scheduleId: slot.id, occurrenceDate, scheduledAt: new Date(occurrenceDate.getTime() + 15 * 3_600_000), creditsSpent: 2 } });
  return occurrenceDate.toISOString().slice(0, 10);
}

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.ownerReservation.deleteMany({ where: { scheduleId: { in: slotIds } } });
  await prisma.classBooking.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.classSchedule.deleteMany({ where: { id: { in: slotIds } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("class tools in bulk", () => {
  it("cancels every upcoming class of one student with a single notice", async () => {
    const admin = await account("admin", "ADMIN");
    const student = await account("student");
    await booked(student.id, 300);
    await booked(student.id, 307);
    expect(await cancelUpcomingClasses(admin.id, student.id, "Moving away")).toBe(2);
    const rows = await prisma.classBooking.findMany({ where: { studentId: student.id } });
    expect(rows.every((r) => r.status === "CANCELED" && r.canceledReason === "Moving away")).toBe(true);
    expect(await prisma.notification.count({ where: { userId: student.id, type: "LESSON_BOOKING_CANCELED" } })).toBe(1);
    await expect(cancelUpcomingClasses(admin.id, student.id, "")).rejects.toThrow(/no upcoming classes/);
  });

  it("closes a day: shows the classes first, cancels them, and keeps the day", async () => {
    const admin = await account("admin", "ADMIN");
    const student = await account("student");
    const date = await booked(student.id, 320);
    const preview = await previewClosedDay(date);
    expect(preview.classes.some((c) => c.student === "Class Tester")).toBe(true);
    const { canceled } = await closeStudioDay(admin.id, admin.email, date, "Holiday");
    expect(canceled).toBeGreaterThanOrEqual(1);
    expect((await prisma.classBooking.findFirstOrThrow({ where: { studentId: student.id } })).status).toBe("CANCELED");
    expect(await prisma.ownerReservation.count({ where: { occurrenceDate: new Date(`${date}T00:00:00Z`), name: CLOSED_NAME, releasedAt: null } })).toBeGreaterThanOrEqual(1);
    await expect(closeStudioDay(admin.id, admin.email, date, "")).rejects.toThrow(/already closed/);
  });
});

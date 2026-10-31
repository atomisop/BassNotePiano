import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { createNotification } from "@/lib/notifications";
import { sendNotificationEmail } from "@/lib/email";
import { withStudentNotice } from "@/lib/notifyScope";
import { computeScheduledAt, chunksForSchedule, rescheduleClassBooking } from "@/lib/classSchedule";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("ns");
let student: { id: string; email: string }, admin: { id: string; email: string }, from: { id: string }, to: { id: string; startTime: string; durationMin: number };
const day = 86_400_000;
const utcDay = (ahead: number) => {
  const t = new Date(Date.now() + ahead * day);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
};

beforeAll(async () => {
  student = await makeUser(tag, "Quiet Student", { classCredits: 20 });
  admin = await makeUser(`${tag}a`, "Owner Person", { role: "ADMIN" });
  from = await prisma.classSchedule.create({ data: { dayOfWeek: 1, startTime: "11:00", durationMin: 45, creditCost: 2, label: `${tag} from` } });
  to = await prisma.classSchedule.create({ data: { dayOfWeek: 3, startTime: "11:00", durationMin: 45, creditCost: 2, label: `${tag} to` } });
});
afterAll(async () => {
  const ids = [student.id, admin.id];
  await prisma.classBooking.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.emailLog.deleteMany({ where: { to: { in: [student.email, admin.email] } } });
  await prisma.classSchedule.deleteMany({ where: { id: { in: [from.id, to.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("the Notify student switch", () => {
  it("with it off, the student gets no notice and no email, while an admin still gets theirs", async () => {
    await withStudentNotice(false, async () => {
      expect(await createNotification({ userId: student.id, type: "ADMIN_ALERT", title: `${tag} quiet` })).toBeNull();
      expect(await createNotification({ userId: admin.id, type: "ADMIN_ALERT", title: `${tag} admin` })).not.toBeNull();
      await sendNotificationEmail(student.email, `${tag} quiet email`, "x");
    });
    expect(await prisma.notification.count({ where: { userId: student.id, title: `${tag} quiet` } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: admin.id, title: `${tag} admin` } })).toBe(1);
    const log = await prisma.emailLog.findFirst({ where: { to: student.email, subject: { contains: `${tag} quiet email` } } });
    expect(log?.status).toBe("SKIPPED");
    expect(log?.detail).toMatch(/chose not to notify/);
  });

  it("with it on (or outside any admin action), the student is told as before", async () => {
    await withStudentNotice(true, () => createNotification({ userId: student.id, type: "ADMIN_ALERT", title: `${tag} loud` }));
    await createNotification({ userId: student.id, type: "ADMIN_ALERT", title: `${tag} plain` });
    expect(await prisma.notification.count({ where: { userId: student.id, title: { in: [`${tag} loud`, `${tag} plain`] } } })).toBe(2);
  });

  it("a real change made quietly still happens: a class moved with Notify off is moved, and the student is not told", async () => {
    const at = new Date(Date.now() + 3 * day);
    const b = await prisma.classBooking.create({
      data: { studentId: student.id, scheduleId: from.id, occurrenceDate: new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())), scheduledAt: at, creditsSpent: 2 },
    });
    const date = utcDay(10);
    const moved = await withStudentNotice(false, () => rescheduleClassBooking(student.id, b.id, to.id, date.getTime(), 0, undefined, { byAdmin: true, anyTime: true }));
    expect(moved.scheduledAt.getTime()).toBe(computeScheduledAt(to, date, chunksForSchedule(to)[0]).getTime());
    expect(await prisma.notification.count({ where: { userId: student.id, title: "Your class was moved" } })).toBe(0);
  });
});

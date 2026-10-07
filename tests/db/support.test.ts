import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { openBookingSupportCase, openSubjectSupportCase } from "@/lib/support";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("sp");
let admin: { id: string }, stu: { id: string }, sched: { id: string }, b1: { id: string }, b2: { id: string };

beforeAll(async () => {
  admin = await makeUser(tag, "Teacher", { role: "ADMIN" });
  stu = await makeUser(tag, "Sam Subscriber");
  sched = await prisma.classSchedule.create({ data: { dayOfWeek: 1, startTime: "10:00", durationMin: 45, creditCost: 2, label: `${tag} Monday class` } });
  const mk = (d: number) =>
    prisma.classBooking.create({ data: { studentId: stu.id, scheduleId: sched.id, occurrenceDate: new Date(Date.UTC(2027, 0, d)), scheduledAt: new Date(Date.UTC(2027, 0, d, 15)), creditsSpent: 2 } });
  b1 = await mk(4);
  b2 = await mk(11);
});
afterAll(async () => {
  await prisma.assistantEscalation.deleteMany({ where: { userId: stu.id } });
  await prisma.notification.deleteMany({ where: { userId: { in: [admin.id, stu.id] } } });
  await prisma.classBooking.deleteMany({ where: { studentId: stu.id } });
  await prisma.classSchedule.delete({ where: { id: sched.id } });
  await prisma.user.deleteMany({ where: { id: { in: [admin.id, stu.id] } } });
});

describe("support cases opened from the app", () => {
  it("opens a Booking case under the real name, reuses it, and adds the second class", async () => {
    const first = await openBookingSupportCase(stu.id, b1.id);
    const e = await prisma.assistantEscalation.findUniqueOrThrow({ where: { id: first.escalationId }, include: { messages: true } });
    expect(e.subject).toBe("Booking");
    expect(e.contactName).toBe("Sam Subscriber");
    expect(e.userId).toBe(stu.id);
    expect(e.messages.map((m) => m.sender)).toEqual(["ATOM", "VISITOR"]);
    expect(e.messages[1].body).toContain("Monday class");
    expect((await openBookingSupportCase(stu.id, b1.id)).escalationId).toBe(first.escalationId);
    expect((await openBookingSupportCase(stu.id, b2.id)).escalationId).toBe(first.escalationId);
    expect(await prisma.supportMessage.count({ where: { escalationId: first.escalationId } })).toBe(3);
    expect(await prisma.notification.findFirst({ where: { userId: admin.id, title: "Sam Subscriber needs help with a booking" } })).toBeTruthy();
  });
  it("refuses someone else's booking", async () => {
    const other = await makeUser(tag, "Other");
    await expect(openBookingSupportCase(other.id, b1.id)).rejects.toThrow(/doesn't exist/);
    await prisma.user.delete({ where: { id: other.id } });
  });
  it("keeps cases with different subjects apart", async () => {
    const a = await openSubjectSupportCase(stu.id, { subject: "Payment", contextLine: "$219.99", request: "Where is it?", noticeTitle: (n) => `${n} asks`, noticeBody: "x" });
    const b = await openSubjectSupportCase(stu.id, { subject: "Scale unlock", contextLine: "Scale 2", request: "Please", noticeTitle: (n) => `${n} asks`, noticeBody: "x" });
    expect(a.escalationId).not.toBe(b.escalationId);
  });
});

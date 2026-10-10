import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { cancelPaymentPlan } from "@/lib/paymentPlans";
import { bookClass, nextOccurrenceDates } from "@/lib/classSchedule";
import { markAttendance } from "@/lib/classScheduleAdmin";
import { noticeAccountChange, noticePaymentReceived } from "@/lib/studentNotices";
import { sendTrialNotices } from "@/lib/trialNotices";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("sn");
let admin: { id: string }, stu: { id: string }, mon: { id: string };
const ids: string[] = [];
const noMarkdownDashes = (s: string | null | undefined) => expect(s ?? "").not.toMatch(/—|–/);

beforeAll(async () => {
  admin = await makeUser(tag, "Teacher", { role: "ADMIN" });
  stu = await makeUser(tag, "Student", { classCredits: 40 });
  ids.push(admin.id, stu.id);
  mon = await prisma.classSchedule.create({ data: { dayOfWeek: 1, startTime: "10:00", durationMin: 45, creditCost: 2, label: `${tag} Monday` } });
});
afterAll(async () => {
  await prisma.appSetting.deleteMany({ where: { key: { startsWith: "trial-notice:" }, value: { gt: "0" } } }).catch(() => undefined);
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.mailMessage.deleteMany({ where: { userId: { in: ids } } });
  await prisma.zellePayment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.classBooking.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: ids } } });
  await prisma.classSchedule.deleteMany({ where: { id: mon.id } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("canceling a plan keeps the payments screen truthful", () => {
  it("closes the unpaid bill but leaves a payment already submitted for review", async () => {
    const plan = await prisma.paymentPlan.create({
      data: { userId: stu.id, cadence: "MIN_60_WEEKLY", term: "MONTHLY", installmentAmountCents: 24000, creditsPerInstallment: 8, termMonths: 1, installmentsPaid: 0, nextDueDate: new Date(), status: "ACTIVE" },
    });
    const pay = { userId: stu.id, paymentPlanId: plan.id, purpose: "PAYMENT_PLAN_INSTALLMENT" as const, amountCents: 24000, zelleHandle: "pay@example.com", lessonQuantity: 8 };
    const awaiting = await prisma.zellePayment.create({ data: { ...pay, installmentNumber: 1, status: "AWAITING_TRANSFER" } });
    const review = await prisma.zellePayment.create({ data: { ...pay, installmentNumber: 2, status: "PENDING_REVIEW", submittedAt: new Date() } });
    await cancelPaymentPlan(plan.id, admin.id, "test");
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } })).status).toBe("CANCELED");
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: awaiting.id } })).status).toBe("EXPIRED");
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: review.id } })).status).toBe("PENDING_REVIEW");
  });
});

describe("notices a student now gets", () => {
  const latest = (title: string) => prisma.notification.findFirst({ where: { userId: stu.id, title }, orderBy: { createdAt: "desc" } });

  it("tells them when Discord is connected or disconnected, and when they are signed out", async () => {
    await noticeAccountChange(stu.id, { kind: "discord-connected", name: "pat#1" });
    await noticeAccountChange(stu.id, { kind: "discord-disconnected", by: "you" });
    await noticeAccountChange(stu.id, { kind: "discord-disconnected", by: "admin" });
    await noticeAccountChange(stu.id, { kind: "phone-cleared" });
    const connected = await latest("Discord connected");
    expect(connected?.type).toBe("ACCOUNT_UPDATE");
    expect(connected?.body).toContain("pat#1");
    const gone = await prisma.notification.findMany({ where: { userId: stu.id, title: "Discord disconnected" } });
    expect(gone).toHaveLength(2);
    expect(gone.some((n) => /The studio disconnected/.test(n.body ?? ""))).toBe(true);
    for (const n of await prisma.notification.findMany({ where: { userId: stu.id } })) noMarkdownDashes(`${n.title} ${n.body}`);
  });

  it("confirms a booking in credits, and says what attendance cost", async () => {
    const when = nextOccurrenceDates(1, 8)[3].getTime();
    const b = await bookClass(stu.id, mon.id, when, 0, 2);
    const booked = await latest("Class booked");
    expect(booked?.type).toBe("LESSON_BOOKING_CONFIRMED");
    expect(booked?.body).toContain("1 credit");
    await markAttendance(b.id, "NO_SHOW");
    const missed = await latest("Class missed");
    expect(missed?.type).toBe("ATTENDANCE_RECORDED");
    expect(missed?.body).toContain("1 credit used");
    noMarkdownDashes(booked?.body);
  });

  it("tells them a submitted payment is being checked", async () => {
    await noticePaymentReceived({ userId: stu.id, amountCents: 19999 });
    const got = await prisma.mailMessage.findFirst({ where: { userId: stu.id, title: "We received your payment" } });
    expect(got?.body).toContain("$199.99");
  });

  it("warns once that a free trial ends, and once that it ended, and never someone who pays", async () => {
    const soon = await makeUser(tag, "Trial Soon", { trialEndsAt: new Date(Date.now() + 12 * 3_600_000) });
    const over = await makeUser(tag, "Trial Over", { trialEndsAt: new Date(Date.now() - 6 * 3_600_000) });
    const paying = await makeUser(tag, "Trial Paid", { trialEndsAt: new Date(Date.now() + 12 * 3_600_000), hasCurriculumAccess: true });
    ids.push(soon.id, over.id, paying.id);
    const first = await sendTrialNotices();
    expect(first.ending).toBeGreaterThanOrEqual(1);
    expect(first.ended).toBeGreaterThanOrEqual(1);
    const second = await sendTrialNotices();
    expect(second).toEqual({ ending: 0, ended: 0 });
    expect(await prisma.notification.count({ where: { userId: soon.id, title: "Your free trial ends tomorrow" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: over.id, title: "Your free trial has ended" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: paying.id } })).toBe(0);
    await prisma.appSetting.deleteMany({ where: { key: { in: [`trial-notice:ending:${soon.id}`, `trial-notice:ended:${over.id}`] } } });
  });
});

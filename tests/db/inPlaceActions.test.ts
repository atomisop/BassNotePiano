import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { freshPhone, makeUser, newTag, prisma } from "./helpers";

// Jobs that now finish where the student is: the server actions behind them, run as the signed-in student.
const tag = newTag("ip");
const who = globalThis as { __ipUser?: string };
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => (who.__ipUser ? { user: { id: who.__ipUser } } : null), getServerSession: async () => null, authOptions: {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect ${to}`); } }));

import { nextOccurrenceDates } from "@/lib/classSchedule";
import { resetSetting, saveSetting } from "@/lib/siteSettings";
import { PARENT_CONTROL_MESSAGE } from "@/lib/parentLinks";
import { approveZellePayment, rejectZellePayment } from "@/lib/payments";
import { payAgainPath, receiptPath } from "@/lib/inPlaceLinks";
import { resetRateLimitBackend } from "@/lib/rateLimit";

const userIds: string[] = [];
let schedule: { id: string };
let admin: { id: string }, child: { id: string }, parent: { id: string }, solo: { id: string }, other: { id: string };

beforeAll(async () => {
  admin = await makeUser(tag, "Teacher Admin", { role: "ADMIN" });
  child = await makeUser(tag, "Kid Student", { classCredits: 20 });
  parent = await makeUser(tag, "Parent Person");
  solo = await makeUser(tag, "Solo Student", { classCredits: 20 });
  other = await makeUser(tag, "Other Student");
  userIds.push(admin.id, child.id, parent.id, solo.id, other.id);
  await prisma.parentLink.create({ data: { parentId: parent.id, childId: child.id, status: "ACCEPTED", respondedAt: new Date() } });
  schedule = await prisma.classSchedule.create({ data: { dayOfWeek: 3, startTime: "15:00", durationMin: 45, creditCost: 2, label: `${tag} slot` } });
  await saveSetting("booking.requestMode", true);
});

afterAll(async () => {
  who.__ipUser = undefined;
  await resetSetting("booking.requestMode");
  await prisma.bookingRequest.deleteMany({ where: { scheduleId: schedule.id } });
  await prisma.parentLink.deleteMany({ where: { OR: [{ parentId: { in: userIds } }, { childId: { in: userIds } }] } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.mailMessage.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.creditGrant.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.zellePayment.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.classSchedule.deleteMany({ where: { id: schedule.id } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("asking for class times", () => {
  const selection = () => [{ scheduleId: schedule.id, occurrenceDateMs: nextOccurrenceDates(3, 4)[2].getTime(), chunkIndex: 0 }];

  it("is refused for a child whose parent controls their schedule, and nothing is sent", async () => {
    const { requestClassTimesAction } = await import("@/app/(dashboard)/lessons/actions");
    who.__ipUser = child.id;
    expect(await requestClassTimesAction(selection())).toEqual({ ok: false, error: PARENT_CONTROL_MESSAGE });
    expect(await prisma.bookingRequest.count({ where: { studentId: child.id } })).toBe(0);
  });

  it("still works for everyone else", async () => {
    const { requestClassTimesAction } = await import("@/app/(dashboard)/lessons/actions");
    who.__ipUser = solo.id;
    const result = await requestClassTimesAction(selection());
    expect(result.ok).toBe(true);
    expect(await prisma.bookingRequest.count({ where: { studentId: solo.id } })).toBe(1);
  });
});

describe("payment notices open the exact step", () => {
  async function pending(userId: string) {
    return prisma.zellePayment.create({
      data: { userId, purpose: "CLASS_CREDITS", lessonQuantity: 2, amountCents: 5599, zelleHandle: "pay@example.com", status: "PENDING_REVIEW", submittedAt: new Date() },
    });
  }

  it("an approval's button opens that payment's receipt", async () => {
    const p = await pending(solo.id);
    await approveZellePayment(p.id, admin.id);
    const mail = await prisma.mailMessage.findFirstOrThrow({ where: { userId: solo.id, title: "Payment approved" }, orderBy: { createdAt: "desc" } });
    expect(mail.actionHref).toBe(receiptPath(p.id));
  });

  it("a rejection's button opens Payment history with that payment's pay sheet", async () => {
    const p = await pending(solo.id);
    await rejectZellePayment(p.id, admin.id, "Name did not match");
    const mail = await prisma.mailMessage.findFirstOrThrow({ where: { userId: solo.id, title: "Payment rejected" }, orderBy: { createdAt: "desc" } });
    expect(mail.actionHref).toBe(payAgainPath(p.id));
    expect(mail.actionLabel).toBe("Resubmit");
  });
});

describe("paying from Payment history", () => {
  it("sends the student's own rejected payment for review again", async () => {
    resetRateLimitBackend();
    const { submitHistoryPaymentAction } = await import("@/app/(dashboard)/billing/history/actions");
    const p = await prisma.zellePayment.create({
      data: { userId: solo.id, purpose: "CLASS_CREDITS", lessonQuantity: 2, amountCents: 5599, zelleHandle: "pay@example.com", status: "REJECTED", rejectionReason: "Try again" },
    });
    who.__ipUser = solo.id;
    await submitHistoryPaymentAction(p.id, { senderName: "Solo Student", method: "ZELLE" });
    const after = await prisma.zellePayment.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.status).toBe("PENDING_REVIEW");
    expect(after.rejectionReason).toBeNull();
  });

  it("never pays someone else's payment", async () => {
    const { submitHistoryPaymentAction } = await import("@/app/(dashboard)/billing/history/actions");
    const p = await prisma.zellePayment.create({
      data: { userId: other.id, purpose: "CLASS_CREDITS", lessonQuantity: 2, amountCents: 5599, zelleHandle: "pay@example.com", status: "AWAITING_TRANSFER" },
    });
    who.__ipUser = solo.id;
    await expect(submitHistoryPaymentAction(p.id, { senderName: "Solo Student", method: "ZELLE" })).rejects.toThrow();
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("AWAITING_TRANSFER");
  });
});

describe("a new phone number from the payment sheet", () => {
  it("is saved to the account and the payment, with the account's own checks", async () => {
    resetRateLimitBackend();
    const { saveNumberToAccountAction } = await import("@/app/(dashboard)/billing/payment-phone-actions");
    const first = freshPhone();
    const next = freshPhone();
    await prisma.user.update({ where: { id: solo.id }, data: { phone: first } });
    const p = await prisma.zellePayment.create({
      data: { userId: solo.id, purpose: "CLASS_CREDITS", lessonQuantity: 2, amountCents: 5599, zelleHandle: "pay@example.com", status: "AWAITING_TRANSFER" },
    });
    who.__ipUser = solo.id;
    const result = await saveNumberToAccountAction(p.id, next);
    expect(result).toEqual({ ok: true, phone: next });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: solo.id } })).phone).toBe(next);
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: p.id } })).senderPhone).toBe(next);
  });

  it("refuses a number another account already has, and changes nothing", async () => {
    resetRateLimitBackend();
    const { saveNumberToAccountAction } = await import("@/app/(dashboard)/billing/payment-phone-actions");
    const theirs = freshPhone();
    await prisma.user.update({ where: { id: other.id }, data: { phone: theirs } });
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: solo.id } })).phone;
    const p = await prisma.zellePayment.create({
      data: { userId: solo.id, purpose: "CLASS_CREDITS", lessonQuantity: 2, amountCents: 5599, zelleHandle: "pay@example.com", status: "AWAITING_TRANSFER" },
    });
    who.__ipUser = solo.id;
    const result = await saveNumberToAccountAction(p.id, theirs);
    expect(result.ok).toBe(false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: solo.id } })).phone).toBe(before);
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: p.id } })).senderPhone).toBeNull();
  });
});

describe("claiming a scholarship says what is left to do", () => {
  it("offers to start the 6 Month plan when there is no plan", async () => {
    resetRateLimitBackend();
    const { claimScholarshipAction } = await import("@/app/(dashboard)/account/scholarship-actions");
    const { createScholarshipCode } = await import("@/lib/scholarships");
    const stu = await makeUser(`${tag}sc`, "Scholar Student", { emailVerified: new Date() });
    userIds.push(stu.id);
    const row = await createScholarshipCode({ email: stu.email, percent: 40, actor: { id: admin.id, email: null } });
    who.__ipUser = stu.id;
    const result = await claimScholarshipAction(row.code);
    expect(result).toMatchObject({ ok: true, percent: 40, next: "start" });
    await prisma.scholarshipCode.deleteMany({ where: { id: row.id } });
  });
});

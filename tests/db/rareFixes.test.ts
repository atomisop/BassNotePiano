import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { rejectZellePayment } from "@/lib/payments";
import { askToBookTogether, claimFriendEmailAsks, getEmailAsksSent, getPendingRequestsSent, respondToFriendRequest, withdrawEmailAsk } from "@/lib/social";
import { bookExtraSessionOccurrence, createReservedBookingIfAbsent, ONE_OFF_LABEL } from "@/lib/classSchedule";
import { attachReceiptToStudent } from "@/lib/paymentReceipts";
import { OFFERED_PLAN_CADENCE } from "@/lib/classCreditPricing";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("rare");
const DAY = 86_400_000;
const ids: string[] = [];
const slotIds: string[] = [];
const groupIds: string[] = [];
const receiptIds: string[] = [];

async function person(label: string, extra: Record<string, unknown> = {}) {
  const u = await makeUser(`${tag}${label}`, `${label[0].toUpperCase()}${label.slice(1)} Person`, { emailVerified: new Date(), ...extra });
  ids.push(u.id);
  return u;
}

async function noticesOf(userId: string) {
  const [bell, mail] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, select: { title: true, body: true } }),
    prisma.mailMessage.findMany({ where: { userId }, select: { title: true, body: true } }),
  ]);
  return [...bell, ...mail];
}

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.mailMessage.deleteMany({ where: { userId: { in: ids } } }).catch(() => undefined);
  await prisma.processedPaymentEmail.deleteMany({ where: { id: { in: receiptIds } } });
  await prisma.classBooking.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.creditGrant.deleteMany({ where: { userId: { in: ids } } });
  await prisma.zellePayment.updateMany({ where: { userId: { in: ids } }, data: { bundleId: null } });
  await prisma.zellePayment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: ids } } });
  await prisma.familyPlanGroup.deleteMany({ where: { id: { in: groupIds } } });
  await prisma.friendEmailAsk.deleteMany({ where: { senderId: { in: ids } } });
  await prisma.friendRequest.deleteMany({ where: { OR: [{ senderId: { in: ids } }, { receiverId: { in: ids } }] } });
  await prisma.ownerReservation.deleteMany({ where: { scheduleId: { in: slotIds } } });
  await prisma.classSchedule.deleteMany({ where: { id: { in: slotIds } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }] } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("a rejected payment on a bill someone else pays", () => {
  it("tells the parent who pays it, sends them to the Parent page, and leaves the child alone", async () => {
    const admin = await person("admin", { role: "ADMIN" });
    const parent = await person("parent");
    const child = await person("child");
    const group = await prisma.familyPlanGroup.create({ data: { payerId: parent.id, kind: "PARENT" } });
    groupIds.push(group.id);
    const plan = await prisma.paymentPlan.create({
      data: { userId: child.id, cadence: OFFERED_PLAN_CADENCE, term: "TERM_3", installmentAmountCents: 20999, creditsPerInstallment: 8, termMonths: 3, installmentsPaid: 1, nextDueDate: new Date(Date.now() + 2 * DAY), familyGroupId: group.id },
    });
    const bill = await prisma.zellePayment.create({
      data: { userId: child.id, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, installmentNumber: 2, amountCents: 20999, lessonQuantity: 8, zelleHandle: "x", status: "PENDING_REVIEW", submittedAt: new Date() },
    });
    await rejectZellePayment(bill.id, admin.id, "the amount was short");
    const toParent = await noticesOf(parent.id);
    expect(toParent.map((n) => n.title)).toContain("Payment rejected");
    expect(toParent.find((n) => n.title === "Payment rejected")?.body).toMatch(/Child Person's plan couldn't be verified: the amount was short/);
    expect((await noticesOf(child.id)).filter((n) => n.title === "Payment rejected")).toHaveLength(0);
  });
});

describe("ask to book together", () => {
  it("lists every ask by its typed email only, whether or not the address has an account, and turns an ask into a request once the account exists", async () => {
    const sender = await person("asker");
    const known = await person("known");
    const unknownEmail = `${tag}-nobody@example.com`;
    await askToBookTogether(sender.id, known.email);
    await askToBookTogether(sender.id, unknownEmail);

    // Both look the same: the typed email and nothing else, and the real friend request is not listed with a profile.
    const asks = await getEmailAsksSent(sender.id);
    expect(asks.map((a) => a.email).sort()).toEqual([known.email.toLowerCase(), unknownEmail].sort());
    for (const a of asks) expect(Object.keys(a).sort()).toEqual(["createdAt", "email", "id"]);
    expect(await getPendingRequestsSent(sender.id)).toHaveLength(0);

    // A decline still looks like waiting; an accept makes them a friend and the ask leaves the list.
    const request = await prisma.friendRequest.findFirstOrThrow({ where: { senderId: sender.id, receiverId: known.id } });
    await respondToFriendRequest(known.id, request.id, true);
    expect((await getEmailAsksSent(sender.id)).map((a) => a.email)).toEqual([unknownEmail]);

    // The unknown address makes an account later and confirms it: the ask becomes a real request, still listed only by email.
    const newcomer = await prisma.user.create({ data: { email: unknownEmail, name: "New Comer", passwordHash: "x", emailVerified: new Date() } });
    ids.push(newcomer.id);
    expect(await claimFriendEmailAsks(newcomer.id, newcomer.email)).toBe(1);
    expect(await claimFriendEmailAsks(newcomer.id, newcomer.email)).toBe(0);
    const made = await prisma.friendRequest.findFirstOrThrow({ where: { senderId: sender.id, receiverId: newcomer.id, status: "PENDING" } });
    expect(await getPendingRequestsSent(sender.id)).toHaveLength(0);

    // Withdrawing takes back the ask and its unanswered request.
    const ask = (await getEmailAsksSent(sender.id))[0];
    await withdrawEmailAsk(sender.id, ask.id);
    expect(await getEmailAsksSent(sender.id)).toHaveLength(0);
    expect(await prisma.friendRequest.findUnique({ where: { id: made.id } })).toBeNull();
  });
});

describe("a time the owner kept on a day off", () => {
  it("stops the weekly auto-booking and an extra session from landing on it", async () => {
    const student = await person("weekly", { classCredits: 8 });
    const day = new Date(Date.now() + 9 * DAY);
    const occurrenceDate = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
    const weekly = await prisma.classSchedule.create({ data: { dayOfWeek: occurrenceDate.getUTCDay(), startTime: "16:00", durationMin: 45, creditCost: 2, label: `${tag} weekly` } });
    const oneOff = await prisma.classSchedule.create({ data: { dayOfWeek: occurrenceDate.getUTCDay(), startTime: "16:15", durationMin: 45, creditCost: 2, label: ONE_OFF_LABEL, active: false } });
    slotIds.push(weekly.id, oneOff.id);
    await prisma.ownerReservation.create({ data: { groupId: `${tag}-g`, scheduleId: oneOff.id, occurrenceDate, chunkIndex: null, name: "Kept Customer", email: `${tag}-customer@example.com`, phone: "+12125550134" } });
    const plan = await prisma.paymentPlan.create({
      data: { userId: student.id, cadence: OFFERED_PLAN_CADENCE, term: "TERM_3", installmentAmountCents: 20999, creditsPerInstallment: 8, termMonths: 3, installmentsPaid: 1, nextDueDate: new Date(Date.now() + 20 * DAY), reservedScheduleId: weekly.id, reservedChunkIndex: 0 },
    });
    // 4:00 PM Eastern that day, which overlaps the kept 4:15 PM time.
    const scheduledAt = new Date(Date.UTC(occurrenceDate.getUTCFullYear(), occurrenceDate.getUTCMonth(), occurrenceDate.getUTCDate(), 21, 0));
    const weeklyBooking = await createReservedBookingIfAbsent({ studentId: student.id, scheduleId: weekly.id, occurrenceDate, scheduledAt, creditsSpent: 2, planId: plan.id });
    expect(weeklyBooking).toBeNull();
    expect(await bookExtraSessionOccurrence({ studentId: student.id, scheduleId: weekly.id, occurrenceDate, scheduledAt, creditsSpent: 2 })).toBe(false);
    expect(await prisma.classBooking.count({ where: { studentId: student.id, status: "SCHEDULED" } })).toBe(0);
  });
});

describe("attaching an early group payment with the wrong amount", () => {
  it("leaves no bill open early, and the right amount still attaches", async () => {
    const admin = await person("owner", { role: "ADMIN" });
    const payer = await person("payer");
    const member = await person("member");
    const group = await prisma.familyPlanGroup.create({ data: { payerId: payer.id, kind: "FAMILY" } });
    groupIds.push(group.id);
    const planData = { cadence: OFFERED_PLAN_CADENCE, term: "TERM_3" as const, installmentAmountCents: 10000, creditsPerInstallment: 8, termMonths: 3, installmentsPaid: 1, nextDueDate: new Date(Date.now() + 20 * DAY), familyGroupId: group.id };
    await prisma.paymentPlan.create({ data: { userId: payer.id, ...planData } });
    await prisma.paymentPlan.create({ data: { userId: member.id, ...planData } });
    const openBills = () => prisma.zellePayment.count({ where: { status: { in: ["AWAITING_TRANSFER", "PENDING_REVIEW"] }, OR: [{ paymentPlan: { familyGroupId: group.id } }, { familyGroupId: group.id }] } });
    expect(await openBills()).toBe(0);

    const wrong = await prisma.processedPaymentEmail.create({ data: { messageId: `<${tag}-wrong@x>`, method: "ZELLE", senderName: "Payer Person", amountCents: 12345 } });
    receiptIds.push(wrong.id);
    await expect(attachReceiptToStudent({ receiptId: wrong.id, userId: payer.id, admin: { id: admin.id, email: admin.email } })).rejects.toThrow(/\$200\.00 and this email is \$123\.45/);
    expect(await openBills()).toBe(0);

    const right = await prisma.processedPaymentEmail.create({ data: { messageId: `<${tag}-right@x>`, method: "ZELLE", senderName: "Payer Person", amountCents: 20000 } });
    receiptIds.push(right.id);
    const done = await attachReceiptToStudent({ receiptId: right.id, userId: payer.id, admin: { id: admin.id, email: admin.email } });
    expect(done.openedEarly).toBe(true);
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: done.paymentId } })).status).toBe("VERIFIED");
  });
});

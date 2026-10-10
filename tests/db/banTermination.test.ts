import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
// Discord is never called from tests: no bot token, and the removal is mocked.
vi.mock("@/lib/discordApi", () => ({ removeFromGuild: vi.fn(async () => "removed") }));
import { banAccount, describeBan } from "@/lib/accountBan";
import { removeFromGuild } from "@/lib/discordApi";
import { bookClass, nextOccurrenceDates } from "@/lib/classSchedule";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("bt");
let admin: { id: string }, stu: { id: string }, other: { id: string }, mon: { id: string }, plan: { id: string };

beforeAll(async () => {
  admin = await makeUser(tag, "Teacher", { role: "ADMIN" });
  stu = await makeUser(tag, "Doomed", { classCredits: 50, hasCurriculumAccess: true, trialEndsAt: new Date(Date.now() + 86_400_000), discordId: `d${tag}`, discordUsername: "doomed" });
  other = await makeUser(tag, "Bystander", { classCredits: 50 });
  mon = await prisma.classSchedule.create({ data: { dayOfWeek: 1, startTime: "10:00", durationMin: 45, creditCost: 2, label: `${tag} Monday` } });
  plan = await prisma.paymentPlan.create({
    data: { userId: stu.id, cadence: "MIN_60_WEEKLY", term: "MONTHLY", installmentAmountCents: 24000, creditsPerInstallment: 8, termMonths: 1, installmentsPaid: 1, nextDueDate: new Date(Date.now() + 20 * 86_400_000), status: "ACTIVE" },
  });
  await bookClass(stu.id, mon.id, nextOccurrenceDates(1, 8)[2].getTime(), 0, 2);
  await bookClass(other.id, mon.id, nextOccurrenceDates(1, 8)[3].getTime(), 0, 2);
  const pay = { purpose: "CLASS_CREDITS" as const, lessonQuantity: 4, amountCents: 11000, zelleHandle: "pay@example.com" };
  await prisma.zellePayment.create({ data: { userId: stu.id, ...pay, status: "AWAITING_TRANSFER" } });
  await prisma.zellePayment.create({ data: { userId: stu.id, ...pay, status: "PENDING_REVIEW", submittedAt: new Date() } });
});

afterAll(async () => {
  const ids = [admin.id, stu.id, other.id];
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.zellePayment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.classBooking.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: ids } } });
  await prisma.classSchedule.deleteMany({ where: { id: mon.id } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("a ban terminates the account", () => {
  it("cancels the plan and every booked class, closes unpaid bills, ends access and Discord, and leaves a payment under review alone", async () => {
    const out = await banAccount({ userId: stu.id, adminId: admin.id, reason: "test" });
    expect(out).toMatchObject({ alreadyBanned: false, plansCanceled: 1, classesCanceled: 1, openBillsClosed: 1, paymentsLeftForReview: 1, discord: "removed" });
    expect(removeFromGuild).toHaveBeenCalledWith(`d${tag}`);

    const u = await prisma.user.findUniqueOrThrow({ where: { id: stu.id } });
    expect(u).toMatchObject({ hasCurriculumAccess: false, trialEndsAt: null, discordId: null, bannedReason: "test", classCredits: 50 });
    expect(u.bannedAt).toBeInstanceOf(Date);
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } })).status).toBe("CANCELED");
    expect(await prisma.classBooking.count({ where: { studentId: stu.id, status: "SCHEDULED" } })).toBe(0);
    expect((await prisma.classBooking.findFirstOrThrow({ where: { studentId: stu.id } })).canceledReason).toBe("Account banned");
    expect(await prisma.zellePayment.count({ where: { userId: stu.id, status: "PENDING_REVIEW" } })).toBe(1);
    expect(await prisma.zellePayment.count({ where: { userId: stu.id, status: "EXPIRED" } })).toBe(1);
    expect(describeBan(out)).toMatch(/1 plan canceled, 1 class canceled, 1 unpaid bill closed, removed from Discord\. 1 payment is still waiting/);
  });

  it("does not touch anyone else, and banning twice does nothing more", async () => {
    expect(await prisma.classBooking.count({ where: { studentId: other.id, status: "SCHEDULED" } })).toBe(1);
    const again = await banAccount({ userId: stu.id, adminId: admin.id, reason: "again" });
    expect(again.alreadyBanned).toBe(true);
  });
});

import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { canonicalEmail } from "@/lib/canonicalEmail";
import { startTrialForEmail } from "@/lib/entitlement";
import { lapsePlanForNonPayment } from "@/lib/paymentPlans";
import { createPresignedLessonUpload } from "@/lib/storage";
import { newTag, prisma } from "./helpers";

const tag = newTag("ag");
const userIds: string[] = [];
const inboxes: string[] = [];

async function account(email: string) {
  const u = await prisma.user.create({ data: { email, name: "Abuse Test", passwordHash: "x", emailCanonical: canonicalEmail(email) } });
  userIds.push(u.id);
  if (!inboxes.includes(canonicalEmail(email))) inboxes.push(canonicalEmail(email));
  return u;
}

afterAll(async () => {
  await prisma.appSetting.deleteMany({ where: { key: { in: inboxes.map((i) => `trial-used:${i}`) } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.mailMessage.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.zellePayment.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("the free trial is once per inbox", () => {
  it("is not given again after the account is deleted and the same inbox registers again", async () => {
    const first = await account(`${tag}-pat@outlook.test`);
    expect(await startTrialForEmail(first.email)).toBe(true);
    await prisma.user.delete({ where: { id: first.id } });
    const again = await account(`${tag}-pat@outlook.test`);
    expect(await startTrialForEmail(again.email)).toBe(false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: again.id } })).trialEndsAt).toBeNull();
  });

  it("is not given to a plus-tag variant of the same inbox, at any domain", async () => {
    const real = await account(`${tag}-sam@icloud.test`);
    expect(await startTrialForEmail(real.email)).toBe(true);
    const tagged = await account(`${tag}-sam+second@icloud.test`);
    expect(await startTrialForEmail(tagged.email)).toBe(false);
  });

  it("two sign-ups racing for one inbox cannot both get it", async () => {
    const a = await account(`${tag}-race@yahoo.test`);
    const b = await account(`${tag}-race+x@yahoo.test`);
    const results = await Promise.all([startTrialForEmail(a.email), startTrialForEmail(b.email)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe("an unpaid plan cannot sit on a weekly time", () => {
  async function plan(userId: string, status: "AWAITING_TRANSFER" | "PENDING_REVIEW") {
    const p = await prisma.paymentPlan.create({
      data: { userId, cadence: "MIN_60_WEEKLY", term: "MONTHLY", installmentAmountCents: 24000, creditsPerInstallment: 8, termMonths: 1, installmentsPaid: 0, nextDueDate: new Date(), status: "ACTIVE" },
    });
    await prisma.zellePayment.create({
      data: { userId, paymentPlanId: p.id, purpose: "PAYMENT_PLAN_INSTALLMENT", amountCents: 24000, zelleHandle: "pay@example.com", lessonQuantity: 8, installmentNumber: 1, status, submittedAt: status === "PENDING_REVIEW" ? new Date() : null },
    });
    return p;
  }

  it("cancels a plan whose first bill never arrived, closes the bill and says why", async () => {
    const u = await account(`${tag}-squat@example.test`);
    const p = await plan(u.id, "AWAITING_TRANSFER");
    expect(await lapsePlanForNonPayment(p.id, { firstBill: true })).toBe(true);
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("CANCELED");
    expect(await prisma.zellePayment.count({ where: { paymentPlanId: p.id, status: "EXPIRED" } })).toBe(1);
    const note = await prisma.mailMessage.findFirst({ where: { userId: u.id } });
    expect(note?.body).toMatch(/first payment did not arrive/);
  });

  it("leaves a plan alone while a payment the student sent is waiting to be checked", async () => {
    const u = await account(`${tag}-paid@example.test`);
    const p = await plan(u.id, "PENDING_REVIEW");
    expect(await lapsePlanForNonPayment(p.id, { firstBill: true })).toBe(false);
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("ACTIVE");
  });
});

describe("lesson files cannot be found by guessing their address", () => {
  it("puts a random token in every new upload's key", async () => {
    Object.assign(process.env, { R2_ACCOUNT_ID: "acct", R2_ACCESS_KEY_ID: "k", R2_SECRET_ACCESS_KEY: "s", R2_BUCKET_NAME: "b", R2_PUBLIC_URL: "https://files.example.test" });
    const a = await createPresignedLessonUpload("scale-1", "lesson.pdf", "application/pdf", 1000);
    const b = await createPresignedLessonUpload("scale-1", "lesson.pdf", "application/pdf", 1000);
    expect(a.key).toMatch(/^lessons\/scale-1\/[0-9a-f]{32}-lesson\.pdf$/);
    expect(a.key).not.toEqual(b.key);
  });
});

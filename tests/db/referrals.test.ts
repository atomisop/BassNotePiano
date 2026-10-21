import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { attachReferral, ensureReferralCode, expireTimedDiscounts, getReferralSummary, rewardReferralForFirstPayment } from "@/lib/referrals";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("rf");
const ids: string[] = [];
let n = 0;

async function person(term: "MONTHLY" | "TERM_3" | "TERM_6" | null = null) {
  const u = await makeUser(`${tag}${n++}`, "Ref Person");
  ids.push(u.id);
  const plan = term
    ? await prisma.paymentPlan.create({
        data: { userId: u.id, cadence: "MIN_60_WEEKLY", term, installmentAmountCents: 20000, creditsPerInstallment: 8, termMonths: 3, installmentsPaid: 1, nextDueDate: new Date(Date.now() + 25 * 86_400_000) },
      })
    : null;
  return { u, plan };
}

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.mailMessage.deleteMany({ where: { userId: { in: ids } } }).catch(() => undefined);
  await prisma.referral.deleteMany({ where: { OR: [{ referrerId: { in: ids } }, { referredId: { in: ids } }] } });
  await prisma.accountDiscount.deleteMany({ where: { userId: { in: ids } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { targetId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("referrals", () => {
  it("gives each person a stable code, and ignores your own, unknown and malformed codes", async () => {
    const a = await person();
    const code = await ensureReferralCode(a.u.id);
    expect(await ensureReferralCode(a.u.id)).toBe(code);
    expect(await attachReferral(a.u.id, code)).toBe(false);
    const b = await person();
    expect(await attachReferral(b.u.id, "ZZZZZZZZ")).toBe(false);
    expect(await attachReferral(b.u.id, "bad")).toBe(false);
    expect(await attachReferral(b.u.id, code)).toBe(true);
    expect(await attachReferral(b.u.id, code)).toBe(false); // one referral per person
    expect((await getReferralSummary(a.u.id)).joined).toBe(1);
  });

  it("pays both a 10% discount that ends by itself, once, only for a 3 or 6 month plan, and then restores the price", async () => {
    const referrer = await person("TERM_3");
    const invited = await person("TERM_6");
    const code = await ensureReferralCode(referrer.u.id);
    await attachReferral(invited.u.id, code);

    await rewardReferralForFirstPayment(invited.u.id, invited.plan!.id);
    for (const p of [referrer, invited]) {
      const d = await prisma.accountDiscount.findUniqueOrThrow({ where: { userId: p.u.id } });
      expect(d.percent).toBe(10);
      expect(d.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 80 * 86_400_000);
      const plan = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: p.plan!.id } });
      expect(plan.installmentAmountCents).toBeLessThan(20000);
      expect(plan.listAmountCents).toBe(20000);
    }
    const referral = await prisma.referral.findUniqueOrThrow({ where: { referredId: invited.u.id } });
    expect(referral.rewardedAt).not.toBeNull();

    const discountedPrice = (await prisma.paymentPlan.findUniqueOrThrow({ where: { id: invited.plan!.id } })).installmentAmountCents;
    await rewardReferralForFirstPayment(invited.u.id, invited.plan!.id); // a second call changes nothing
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: invited.plan!.id } })).installmentAmountCents).toBe(discountedPrice);

    await prisma.accountDiscount.updateMany({ where: { userId: { in: [referrer.u.id, invited.u.id] } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await expireTimedDiscounts(new Date())).toBeGreaterThanOrEqual(2);
    for (const p of [referrer, invited]) {
      expect(await prisma.accountDiscount.count({ where: { userId: p.u.id } })).toBe(0);
      expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: p.plan!.id } })).installmentAmountCents).toBe(20000);
    }
  });

  it("pays nothing for a Monthly first plan, and never lowers a bigger discount the referrer already has", async () => {
    const referrer = await person("TERM_3");
    await prisma.accountDiscount.create({ data: { userId: referrer.u.id, percent: 25 } });
    const monthly = await person("MONTHLY");
    await attachReferral(monthly.u.id, await ensureReferralCode(referrer.u.id));
    await rewardReferralForFirstPayment(monthly.u.id, monthly.plan!.id);
    expect(await prisma.accountDiscount.count({ where: { userId: monthly.u.id } })).toBe(0);
    expect((await prisma.referral.findUniqueOrThrow({ where: { referredId: monthly.u.id } })).rewardedAt).toBeNull();

    const term = await person("TERM_3");
    await attachReferral(term.u.id, await ensureReferralCode(referrer.u.id));
    await rewardReferralForFirstPayment(term.u.id, term.plan!.id);
    expect((await prisma.accountDiscount.findUniqueOrThrow({ where: { userId: referrer.u.id } })).percent).toBe(25);
    expect((await prisma.accountDiscount.findUniqueOrThrow({ where: { userId: term.u.id } })).percent).toBe(10);
  });
});

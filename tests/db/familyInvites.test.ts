import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { canonicalEmail } from "@/lib/canonicalEmail";
import { OFFERED_PLAN_CADENCE, calculateFamilyBundleTotal, calculatePaymentPlanRate } from "@/lib/classCreditPricing";
import { createFamilyPlans, createPaymentPlan, MAX_UNPAID_STARTS_PER_WEEK, PaymentPlanError } from "@/lib/paymentPlans";
import { cancelFamilyInvite, FamilyInviteError, listInvitesForPerson, listInvitesFromPayer, respondToFamilyInvite, sendFamilyInvite } from "@/lib/familyInvites";
import { getPricingConfig } from "@/lib/pricing";
import { PRICE_CHANGED_MESSAGE } from "@/lib/planCheckout";
import { newTag, prisma } from "./helpers";

const tag = newTag("inv");
const ids: string[] = [];
const slots: string[] = [];

async function account(label: string, name = "Some Person") {
  const email = `${tag}-${label}@example.test`;
  const u = await prisma.user.create({ data: { email, name, passwordHash: "x", emailCanonical: canonicalEmail(email) } });
  ids.push(u.id);
  return u;
}
async function slot() {
  const s = await prisma.classSchedule.create({ data: { dayOfWeek: 3, startTime: "10:00", durationMin: 45, creditCost: 2, label: `${tag} slot ${slots.length}` } });
  slots.push(s.id);
  return s.id;
}
const base = (payerId: string, memberEmails: string[], reservedScheduleId: string) => ({
  payerId, cadence: OFFERED_PLAN_CADENCE, term: "MONTHLY" as const, zelleHandle: "pay@example.com", reservedScheduleId, reservedChunkIndex: 0, memberEmails,
});

afterAll(async () => {
  await prisma.familyInvite.deleteMany({ where: { OR: [{ payerId: { in: ids } }, { inviteeId: { in: ids } }] } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.zellePayment.deleteMany({ where: { OR: [{ userId: { in: ids } }, { familyGroup: { payerId: { in: ids } } }] } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: ids } } });
  await prisma.familyPlanGroup.deleteMany({ where: { payerId: { in: ids } } });
  await prisma.classSchedule.deleteMany({ where: { id: { in: slots } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe("family invitations", () => {
  it("a family cannot start until every other member has accepted", async () => {
    const payer = await account("payer", "Parent Tester");
    const kid = await account("kid", "Child Tester");
    const s = await slot();
    await expect(createFamilyPlans(base(payer.id, [kid.email], s))).rejects.toThrow(/accept/i);

    expect(await sendFamilyInvite(payer.id, kid.email)).toBe("PENDING");
    expect((await listInvitesForPerson(kid.id)).length).toBe(1);
    await expect(createFamilyPlans(base(payer.id, [kid.email], s))).rejects.toThrow(/accept/i);
    // The invited person has nothing started for them while they have not answered.
    expect(await prisma.paymentPlan.count({ where: { userId: kid.id } })).toBe(0);

    const [invite] = await listInvitesForPerson(kid.id);
    await respondToFamilyInvite(kid.id, invite.id, true);
    expect(await listInvitesFromPayer(payer.id)).toEqual([{ email: kid.email, status: "ACCEPTED" }]);

    const made = await createFamilyPlans(base(payer.id, [kid.email], s));
    expect(made.plans).toHaveLength(2);
    // Spent: the same yes cannot start a second family.
    expect(await prisma.familyInvite.count({ where: { payerId: payer.id } })).toBe(0);
  });

  it("only the invited person can answer, and a decline blocks asking again", async () => {
    const payer = await account("payer2", "Parent Two");
    const kid = await account("kid2", "Child Two");
    const stranger = await account("stranger", "Other Person");
    await sendFamilyInvite(payer.id, kid.email);
    const [invite] = await listInvitesForPerson(kid.id);
    await expect(respondToFamilyInvite(stranger.id, invite.id, true)).rejects.toBeInstanceOf(FamilyInviteError);
    await respondToFamilyInvite(kid.id, invite.id, false);
    expect(await sendFamilyInvite(payer.id, kid.email)).toBe("DECLINED");
    expect(await listInvitesForPerson(kid.id)).toHaveLength(0);
    await expect(respondToFamilyInvite(kid.id, invite.id, true)).rejects.toBeInstanceOf(FamilyInviteError);
  });

  it("an accepted yes is for that payer only, and withdrawing it takes it back", async () => {
    const a = await account("payA", "Payer Alpha");
    const b = await account("payB", "Payer Bravo");
    const kid = await account("kid3", "Child Three");
    const s = await slot();
    await sendFamilyInvite(a.id, kid.email);
    const [invite] = await listInvitesForPerson(kid.id);
    await respondToFamilyInvite(kid.id, invite.id, true);
    await expect(createFamilyPlans(base(b.id, [kid.email], s))).rejects.toThrow(/accept/i);
    await cancelFamilyInvite(a.id, kid.email);
    await expect(createFamilyPlans(base(a.id, [kid.email], s))).rejects.toThrow(/accept/i);
  });

  it("a yes older than the window no longer counts", async () => {
    const payer = await account("payer4", "Parent Four");
    const kid = await account("kid4", "Child Four");
    const s = await slot();
    await prisma.familyInvite.create({ data: { payerId: payer.id, inviteeId: kid.id, status: "ACCEPTED", createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) } });
    await expect(createFamilyPlans(base(payer.id, [kid.email], s))).rejects.toThrow(/accept/i);
  });
});

describe("what was shown is what is charged", () => {
  it("refuses when the expected first payment is not the real one, for solo and family", async () => {
    const pricing = await getPricingConfig();
    const rate = calculatePaymentPlanRate(OFFERED_PLAN_CADENCE, "MONTHLY", pricing);
    const solo = await account("solo", "Solo Person");
    const s = await slot();
    await expect(createPaymentPlan(solo.id, OFFERED_PLAN_CADENCE, "MONTHLY", "pay@example.com", s, 0, rate.installmentAmountCents + 100)).rejects.toThrow(PRICE_CHANGED_MESSAGE);
    expect(await prisma.paymentPlan.count({ where: { userId: solo.id } })).toBe(0);
    const ok = await createPaymentPlan(solo.id, OFFERED_PLAN_CADENCE, "MONTHLY", "pay@example.com", s, 0, rate.installmentAmountCents);
    expect(ok.installmentPayments[0].amountCents).toBe(rate.installmentAmountCents);

    const payer = await account("fpayer", "Family Payer");
    const kid = await account("fkid", "Family Kid");
    await sendFamilyInvite(payer.id, kid.email);
    const [invite] = await listInvitesForPerson(kid.id);
    await respondToFamilyInvite(kid.id, invite.id, true);
    const each = calculateFamilyBundleTotal(OFFERED_PLAN_CADENCE, "MONTHLY", 2, pricing).perStudentMonthlyCents;
    const s2 = await slot();
    await expect(createFamilyPlans({ ...base(payer.id, [kid.email], s2), expectedFirstPaymentCents: each * 2 - 1 })).rejects.toThrow(PRICE_CHANGED_MESSAGE);
    const made = await createFamilyPlans({ ...base(payer.id, [kid.email], s2), expectedFirstPaymentCents: each * 2 });
    expect(made.startPayment.amountCents).toBe(each * 2);
  });
});

describe("holding times without paying", () => {
  it("stops a person who keeps starting plans and never pays", async () => {
    const person = await account("hoarder", "Time Hoarder");
    for (let i = 0; i < MAX_UNPAID_STARTS_PER_WEEK; i++) {
      const plan = await createPaymentPlan(person.id, OFFERED_PLAN_CADENCE, "MONTHLY", "pay@example.com", await slot(), 0);
      await prisma.paymentPlan.update({ where: { id: plan.id }, data: { status: "CANCELED" } });
    }
    const err = await createPaymentPlan(person.id, OFFERED_PLAN_CADENCE, "MONTHLY", "pay@example.com", await slot(), 0).catch((e) => e);
    expect(err).toBeInstanceOf(PaymentPlanError);
    expect(String(err.message)).toMatch(/without paying/);
  });
});

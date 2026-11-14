import { afterAll, describe, expect, it, vi } from "vitest";

// A scholarship on a group or parent plan belongs to ONE PERSON on it: their share of the price drops, the others' do not, and the
// payer may type the code on that person's row only for someone who has accepted them. Real rows in a local database.
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { randomInt } from "crypto";
import { canonicalEmail } from "@/lib/canonicalEmail";
import { OFFERED_PLAN_CADENCE, calculateFamilyBundleTotal, calculatePaymentPlanRate } from "@/lib/classCreditPricing";
import { createFamilyPlans, getOrCreateOpenInstallmentPayment, cancelPaymentPlan, PaymentPlanError } from "@/lib/paymentPlans";
import { approveZellePayment, submitZellePaymentReference } from "@/lib/payments";
import { claimScholarshipCode, revokeScholarshipCode } from "@/lib/scholarships";
import { acceptedMemberOf, claimScholarshipForMember, scholarshipPercentForAccepted } from "@/lib/groupScholarship";
import { scholarshipPercentsFor } from "@/lib/scholarshipPercents";
import { groupShareCents } from "@/lib/groupShares";
import { syncGroupBundle } from "@/lib/paymentBundles";
import { newTag, prisma } from "./helpers";

const tag = newTag("gs");
const userIds: string[] = [];
const slotIds: string[] = [];
const NAMES = ["Alice Anders", "Bob Becker", "Cara Colefield", "Dan Dorsey", "Eve Everhart", "Finn Fairbanks", "Gus Gallagher", "Hana Holloway"];
let nameIx = 0;

async function newSlot() {
  const slot = await prisma.classSchedule.create({ data: { dayOfWeek: 3, startTime: "10:00", durationMin: 45, creditCost: 2, label: `${tag} slot ${slotIds.length}` } });
  slotIds.push(slot.id);
  return slot.id;
}
async function account(label: string, verified = true) {
  const email = `${tag}-${label}@example.test`;
  const u = await prisma.user.create({ data: { email, name: NAMES[nameIx++ % NAMES.length], passwordHash: "x", emailCanonical: canonicalEmail(email), emailVerified: verified ? new Date() : null } });
  userIds.push(u.id);
  return u;
}
/** A scholarship code made for this account's email, as the owner would make one. */
async function codeFor(email: string, percent: number): Promise<string> {
  const code = Array.from({ length: 16 }, () => String(randomInt(0, 10))).join("");
  await prisma.scholarshipCode.create({ data: { code, assignedEmail: email.toLowerCase(), percent } });
  return code;
}
/** The account claims a scholarship on its own, signed in, as Settings lets it. */
async function ownScholarship(user: { id: string; email: string }, percent: number) {
  await claimScholarshipCode(user.id, await codeFor(user.email, percent));
}
async function accept(payerId: string, memberId: string, status: "ACCEPTED" | "PENDING" | "DECLINED" = "ACCEPTED", createdAt = new Date()) {
  await prisma.familyInvite.upsert({ where: { payerId_inviteeId: { payerId, inviteeId: memberId } }, create: { payerId, inviteeId: memberId, status, createdAt }, update: { status, createdAt } });
}
async function makeGroup(term: "TERM_6" | "TERM_3", payer: { id: string }, others: { id: string; email: string }[], extra: Partial<Parameters<typeof createFamilyPlans>[0]> = {}) {
  for (const o of others) await accept(payer.id, o.id);
  return createFamilyPlans({ payerId: payer.id, cadence: OFFERED_PLAN_CADENCE, term, zelleHandle: "pay@example.com", reservedScheduleId: await newSlot(), reservedChunkIndex: 0, memberEmails: others.map((o) => o.email), ...extra });
}

/** The payer sends the combined first payment, then it is approved: how a real group starts. */
async function startGroup(payer: { id: string; name: string | null }, startPaymentId: string) {
  await submitZellePaymentReference(payer.id, startPaymentId, { senderName: payer.name ?? "Payer Name" });
  await approveZellePayment(startPaymentId, null);
}
/** Billing notices go to a person's Mail, the rest to the bell: count both. */
async function noticesTitled(userId: string, title: string) {
  return (await prisma.notification.count({ where: { userId, title } })) + (await prisma.mailMessage.count({ where: { userId, title } }));
}

afterAll(async () => {
  await prisma.familyInvite.deleteMany({ where: { OR: [{ payerId: { in: userIds } }, { inviteeId: { in: userIds } }] } });
  await prisma.parentLink.deleteMany({ where: { OR: [{ parentId: { in: userIds } }, { childId: { in: userIds } }] } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.mailMessage.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.creditGrant.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.classBooking.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.zellePayment.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { familyGroup: { payerId: { in: userIds } } }] } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.familyPlanGroup.deleteMany({ where: { payerId: { in: userIds } } });
  await prisma.scholarshipCode.deleteMany({ where: { assignedEmail: { startsWith: tag } } });
  await prisma.auditLog.deleteMany({ where: { actorEmail: { startsWith: tag } } }).catch(() => undefined);
  await prisma.classSchedule.deleteMany({ where: { id: { in: slotIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("each person's own scholarship on a group plan", () => {
  it("prices every share on its own and the first payment is their sum (6 Month plan)", async () => {
    const payer = await account("p1");
    const free = await account("free1");
    const half = await account("half1");
    await ownScholarship(free, 100);
    await ownScholarship(half, 50);
    const base = calculateFamilyBundleTotal(OFFERED_PLAN_CADENCE, "TERM_6", 3).perStudentMonthlyCents;
    const { plans, startPayment } = await makeGroup("TERM_6", payer, [free, half]);

    const of = (id: string) => plans.find((p) => p.userId === id)!;
    expect(of(payer.id).installmentAmountCents).toBe(base);
    expect(of(payer.id).listAmountCents).toBeNull();
    expect(of(free.id).installmentAmountCents).toBe(0);
    expect(of(free.id).listAmountCents).toBe(base);
    expect(of(half.id).installmentAmountCents).toBe(groupShareCents(base, "TERM_6", 50));
    expect(of(half.id).installmentAmountCents).toBeGreaterThan(0);
    expect(of(half.id).installmentAmountCents).toBeLessThan(base);
    expect(startPayment.amountCents).toBe(base + 0 + of(half.id).installmentAmountCents);
  });

  it("a scholarship does nothing on a 3 Month group", async () => {
    const payer = await account("p2");
    const free = await account("free2");
    await ownScholarship(free, 100);
    const base = calculateFamilyBundleTotal(OFFERED_PLAN_CADENCE, "TERM_3", 2).perStudentMonthlyCents;
    const { plans, startPayment } = await makeGroup("TERM_3", payer, [free]);
    expect(plans.every((p) => p.installmentAmountCents === base && p.listAmountCents === null)).toBe(true);
    expect(startPayment.amountCents).toBe(base * 2);
  });

  it("a group whose every share is covered starts by itself: nothing to pay, every plan running, everyone told", async () => {
    const payer = await account("p3");
    const free = await account("free3");
    await ownScholarship(payer, 100);
    await ownScholarship(free, 100);
    const { plans, startPayment } = await makeGroup("TERM_6", payer, [free]);
    expect(startPayment.amountCents).toBe(0);
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: startPayment.id } })).status).toBe("VERIFIED");
    const after = await prisma.paymentPlan.findMany({ where: { id: { in: plans.map((p) => p.id) } } });
    expect(after.every((p) => p.installmentsPaid === 1 && p.status === "ACTIVE")).toBe(true);
    expect(await noticesTitled(free.id, "Your group plan started")).toBeGreaterThan(0);
  });

  it("refuses a first payment the screen did not show, but accepts the plain group total (a screen that does not show scholarships)", async () => {
    const payer = await account("p4");
    const free = await account("free4");
    await ownScholarship(free, 100);
    const base = calculateFamilyBundleTotal(OFFERED_PLAN_CADENCE, "TERM_6", 2).perStudentMonthlyCents;
    await expect(makeGroup("TERM_6", payer, [free], { expectedFirstPaymentCents: base + 123 })).rejects.toBeInstanceOf(PaymentPlanError);
    const ok = await makeGroup("TERM_6", payer, [free], { expectedFirstPaymentCents: base * 2 }); // the undiscounted total: pays the smaller real amount
    expect(ok.startPayment.amountCents).toBe(base);
  });

  it("a payer switching in from their own plan gets THEIR share, not a copy of another member's", async () => {
    const payer = await account("p5");
    const other = await account("o5");
    await ownScholarship(payer, 100); // the payer is covered; the other member pays in full
    const slot = await newSlot();
    await prisma.paymentPlan.create({
      data: { userId: payer.id, cadence: OFFERED_PLAN_CADENCE, term: "TERM_6", installmentAmountCents: 0, creditsPerInstallment: 8, termMonths: 6, installmentsPaid: 2, nextDueDate: new Date(Date.now() + 10 * 86_400_000), status: "ACTIVE", reservedScheduleId: slot, reservedChunkIndex: 0 },
    });
    const base = calculateFamilyBundleTotal(OFFERED_PLAN_CADENCE, "TERM_6", 2).perStudentMonthlyCents;
    const { startPayment } = await makeGroup("TERM_6", payer, [other], { verifiedSwitch: true, reservedScheduleId: undefined });
    expect(startPayment.amountCents).toBe(base); // only the other member pays; the payer's share is $0
    await startGroup(payer, startPayment.id);
    const mine = await prisma.paymentPlan.findFirstOrThrow({ where: { userId: payer.id, status: "ACTIVE" } });
    expect(mine.installmentAmountCents).toBe(0);
    expect(mine.listAmountCents).toBe(base);
    expect((await prisma.paymentPlan.findFirstOrThrow({ where: { userId: other.id, status: "ACTIVE" } })).installmentAmountCents).toBe(base);
  });
});

describe("what happens after the group starts", () => {
  it("a person whose share is covered gets a $0 bill that settles itself, and it is never held in the payer's combined bill", async () => {
    const payer = await account("p6");
    const free = await account("free6");
    const paying = await account("paying6");
    await ownScholarship(free, 100);
    const base = calculateFamilyBundleTotal(OFFERED_PLAN_CADENCE, "TERM_6", 3).perStudentMonthlyCents;
    const { group, plans, startPayment } = await makeGroup("TERM_6", payer, [free, paying]);
    await startGroup(payer, startPayment.id);
    // Month two is due now for everyone.
    await prisma.paymentPlan.updateMany({ where: { id: { in: plans.map((p) => p.id) } }, data: { nextDueDate: new Date() } });
    for (const plan of plans) await getOrCreateOpenInstallmentPayment(plan.id, "pay@example.com").catch(() => undefined);

    const freePlan = await prisma.paymentPlan.findFirstOrThrow({ where: { userId: free.id, familyGroupId: group.id } });
    expect(freePlan.installmentsPaid).toBe(2); // month two settled by itself
    expect(await prisma.zellePayment.count({ where: { paymentPlanId: freePlan.id, status: "AWAITING_TRANSFER" } })).toBe(0);
    const bundle = await prisma.zellePayment.findFirst({ where: { purpose: "FAMILY_PLAN_INSTALLMENT", familyGroupId: group.id, status: "AWAITING_TRANSFER" }, include: { bundled: true } });
    expect(bundle?.amountCents).toBe(base * 2); // the payer's and the other member's shares only
    expect(bundle?.bundled.every((b) => b.amountCents > 0)).toBe(true);
  });

  it("syncGroupBundle never holds a $0 bill, even one left open", async () => {
    const payer = await account("p7");
    const free = await account("free7");
    const paying = await account("paying7");
    await ownScholarship(free, 100);
    const { group, plans, startPayment } = await makeGroup("TERM_6", payer, [free, paying]);
    await startGroup(payer, startPayment.id);
    const bills = await Promise.all(
      plans.map((plan) => prisma.zellePayment.create({ data: { userId: plan.userId, purpose: "PAYMENT_PLAN_INSTALLMENT", paymentPlanId: plan.id, amountCents: plan.installmentAmountCents, installmentNumber: 2, zelleHandle: "h", status: "AWAITING_TRANSFER" } })),
    );
    const { bundleId } = await syncGroupBundle(group.id, "h");
    expect(bundleId).not.toBeNull();
    const held = await prisma.zellePayment.findMany({ where: { bundleId: bundleId! } });
    expect(held.every((h) => h.amountCents > 0)).toBe(true);
    const zero = bills.find((b) => b.amountCents === 0)!;
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: zero.id } })).bundleId).toBeNull();
  });

  it("a lone survivor pays the solo price less their OWN scholarship", async () => {
    const payer = await account("p8");
    const half = await account("half8");
    await ownScholarship(payer, 50);
    const { plans, startPayment } = await makeGroup("TERM_6", payer, [half]);
    await startGroup(payer, startPayment.id);
    const memberPlan = plans.find((p) => p.userId === half.id)!;
    await cancelPaymentPlan(memberPlan.id, payer.id, "Left the group"); // down to one person
    const payerPlan = plans.find((p) => p.userId === payer.id)!;
    await prisma.paymentPlan.update({ where: { id: payerPlan.id }, data: { nextDueDate: new Date() } });
    const solo = calculatePaymentPlanRate(OFFERED_PLAN_CADENCE, "TERM_6").installmentAmountCents;
    const { payment } = await getOrCreateOpenInstallmentPayment(payerPlan.id, "pay@example.com");
    expect(payment?.amountCents).toBe(groupShareCents(solo, "TERM_6", 50));
  });
});

describe("the payer types a code on someone's row", () => {
  it("is claimed onto THAT person's account, prices their share, tells them, and is audited", async () => {
    const payer = await account("p9");
    const member = await account("m9");
    await accept(payer.id, member.id);
    const code = await codeFor(member.email, 40);

    expect(await claimScholarshipForMember(payer.id, member.email, code)).toEqual({ percent: 40 });
    const row = await prisma.scholarshipCode.findUniqueOrThrow({ where: { code } });
    expect(row.claimedById).toBe(member.id);
    expect((await scholarshipPercentsFor([member.id])).get(member.id)).toBe(40);
    expect(await noticesTitled(member.id, "Your scholarship was used for a group plan")).toBe(1);
    const audit = await prisma.auditLog.findFirst({ where: { action: "scholarship.claim", actorId: payer.id } });
    expect(audit?.detail).toContain(member.email);
    // The same code cannot be typed twice.
    await expect(claimScholarshipForMember(payer.id, member.email, code)).rejects.toThrow(/already been claimed/i);
  });

  it("is refused for anyone who has not accepted this payer, and the code stays unclaimed", async () => {
    const payer = await account("p10");
    const stranger = await account("stranger10");
    const pending = await account("pending10");
    const declined = await account("declined10");
    const stale = await account("stale10");
    await accept(payer.id, pending.id, "PENDING");
    await accept(payer.id, declined.id, "DECLINED");
    await accept(payer.id, stale.id, "ACCEPTED", new Date(Date.now() - 8 * 86_400_000)); // older than the 7 days an invitation lasts
    for (const person of [stranger, pending, declined, stale]) {
      const code = await codeFor(person.email, 30);
      await expect(claimScholarshipForMember(payer.id, person.email, code)).rejects.toThrow(/isn't valid for this person/i);
      expect((await prisma.scholarshipCode.findUniqueOrThrow({ where: { code } })).claimedAt).toBeNull();
    }
  });

  it("is refused when the code was made for someone else, for an unverified, banned or admin account, and for the payer themselves", async () => {
    const payer = await account("p11");
    const member = await account("m11");
    const other = await account("other11");
    const unverified = await account("unv11", false);
    const banned = await account("banned11");
    await prisma.user.update({ where: { id: banned.id }, data: { bannedAt: new Date() } });
    for (const person of [member, unverified, banned]) await accept(payer.id, person.id);

    const forOther = await codeFor(other.email, 30);
    await expect(claimScholarshipForMember(payer.id, member.email, forOther)).rejects.toThrow(/isn't valid for this person/i);
    expect((await prisma.scholarshipCode.findUniqueOrThrow({ where: { code: forOther } })).claimedAt).toBeNull();

    for (const person of [unverified, banned]) {
      const code = await codeFor(person.email, 30);
      await expect(claimScholarshipForMember(payer.id, person.email, code)).rejects.toThrow(/isn't valid for this person/i);
      expect((await prisma.scholarshipCode.findUniqueOrThrow({ where: { code } })).claimedAt).toBeNull();
    }
    const mine = await codeFor(payer.email, 30);
    await expect(claimScholarshipForMember(payer.id, payer.email, mine)).rejects.toThrow(/isn't valid for this person/i);
    await expect(claimScholarshipForMember(payer.id, member.email, "12345")).rejects.toThrow(/16 digits/i);
  });

  it("works for a child who accepted a parent's link", async () => {
    const parent = await account("par12");
    const child = await account("kid12");
    await prisma.parentLink.create({ data: { parentId: parent.id, childId: child.id, status: "ACCEPTED" } });
    const code = await codeFor(child.email, 25);
    expect(await claimScholarshipForMember(parent.id, child.email, code)).toEqual({ percent: 25 });
    expect((await scholarshipPercentsFor([child.id])).get(child.id)).toBe(25);
  });

  it("shows the payer a person's scholarship percent only once that person has accepted them", async () => {
    const payer = await account("p13");
    const member = await account("m13");
    const stranger = await account("s13");
    await ownScholarship(member, 60);
    await ownScholarship(stranger, 80);
    await accept(payer.id, member.id);
    expect(await scholarshipPercentForAccepted(payer.id, member.email)).toBe(60);
    expect(await scholarshipPercentForAccepted(payer.id, stranger.email)).toBeNull(); // never for an arbitrary address
    expect(await scholarshipPercentForAccepted(payer.id, "nobody@example.test")).toBeNull();
    expect(await acceptedMemberOf(payer.id, member.email)).toMatchObject({ id: member.id });
    expect(await acceptedMemberOf(payer.id, payer.email)).toBeNull();
  });
});

describe("a person's scholarship is never revealed to someone they have not accepted", () => {
  it("a wrong or right first-payment guess against a stranger gets the same answer: they have not accepted", async () => {
    const payer = await account("p14");
    const victim = await account("v14"); // holds a 100% scholarship, never accepted this payer
    await ownScholarship(victim, 100);
    const base = calculateFamilyBundleTotal(OFFERED_PLAN_CADENCE, "TERM_6", 2).perStudentMonthlyCents;
    const slot = await newSlot();
    const attempt = (expected: number) =>
      createFamilyPlans({ payerId: payer.id, cadence: OFFERED_PLAN_CADENCE, term: "TERM_6", zelleHandle: "h", reservedScheduleId: slot, reservedChunkIndex: 0, memberEmails: [victim.email], expectedFirstPaymentCents: expected }).then(
        () => "created",
        (err: Error) => err.message,
      );
    const guessRight = await attempt(base); // the payer's full share plus the victim's covered share: exactly the real total
    const guessWrong = await attempt(base + 777);
    expect(guessRight).toMatch(/must accept their invitation/i);
    expect(guessWrong).toBe(guessRight); // no difference to learn from
    expect(await prisma.paymentPlan.count({ where: { userId: { in: [payer.id, victim.id] } } })).toBe(0);
  });
});

describe("a scholarship claimed or revoked after the group is running", () => {
  async function runningGroup(label: string) {
    const payer = await account(`p-${label}`);
    const member = await account(`m-${label}`);
    const base = calculateFamilyBundleTotal(OFFERED_PLAN_CADENCE, "TERM_6", 2).perStudentMonthlyCents;
    const { plans, startPayment } = await makeGroup("TERM_6", payer, [member]);
    return { payer, member, base, plans, startPayment };
  }

  it("changes that person's share from their next bill, and revoking puts it back", async () => {
    const { payer, member, base, plans, startPayment } = await runningGroup("15");
    await startGroup(payer, startPayment.id);
    const memberPlan = plans.find((p) => p.userId === member.id)!;
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: memberPlan.id } })).installmentAmountCents).toBe(base);

    // The invitations are spent once the group exists, so the member claims their own code, as Settings lets them.
    const code = await codeFor(member.email, 100);
    await claimScholarshipCode(member.id, code);
    const covered = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: memberPlan.id } });
    expect(covered.installmentAmountCents).toBe(0);
    expect(covered.listAmountCents).toBe(base);
    // The payer's own share is untouched.
    expect((await prisma.paymentPlan.findFirstOrThrow({ where: { userId: payer.id, familyGroupId: memberPlan.familyGroupId } })).installmentAmountCents).toBe(base);

    const row = await prisma.scholarshipCode.findUniqueOrThrow({ where: { code } });
    await revokeScholarshipCode(row.id, { id: payer.id, email: payer.email });
    const back = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: memberPlan.id } });
    expect(back.installmentAmountCents).toBe(base);
    expect(back.listAmountCents).toBeNull();
  });

  it("leaves a group that has not started alone (its first payment was asked for at the price shown)", async () => {
    const { payer, member, base, plans } = await runningGroup("16");
    const memberPlan = plans.find((p) => p.userId === member.id)!;
    await claimScholarshipCode(member.id, await codeFor(member.email, 100));
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: memberPlan.id } })).installmentAmountCents).toBe(base);
    void payer;
  });
});

import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { claimScholarshipCode, createScholarshipCode, findScholarshipAccount, regenerateScholarshipCode, revokeScholarshipCode, ScholarshipError, updateScholarshipCode } from "@/lib/scholarships";
import { getDiscountPercent, setAccountDiscount } from "@/lib/accountDiscounts";
import { OFFERED_PLAN_CADENCE, calculatePaymentPlanRate, discountedPlanPriceCents } from "@/lib/classCreditPricing";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("sch");
const ids: string[] = [];

async function plan(userId: string, term: "MONTHLY" | "TERM_3" | "TERM_6", cents = 21999, extra: Record<string, unknown> = {}) {
  return prisma.paymentPlan.create({
    data: { userId, cadence: "MIN_60_WEEKLY", term, installmentAmountCents: cents, creditsPerInstallment: 8, termMonths: term === "TERM_6" ? 6 : term === "TERM_3" ? 3 : 1, installmentsPaid: 1, nextDueDate: new Date(Date.now() + 5 * 86_400_000), status: "ACTIVE", ...extra },
  });
}

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.mailMessage.deleteMany({ where: { userId: { in: ids } } }).catch(() => undefined);
  await prisma.zellePayment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: ids } } });
  await prisma.accountDiscount.deleteMany({ where: { userId: { in: ids } } });
  await prisma.scholarshipCode.deleteMany({ where: { OR: [{ claimedById: { in: ids } }, { createdById: { in: ids } }] } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("scholarship discount codes", () => {
  it("claims once, for the right email only, and the discount prices the 6 Month plan only", async () => {
    const admin = await makeUser(`${tag}a`, "Owner", { role: "ADMIN" });
    const stu = await makeUser(`${tag}s`, "Student One", { emailVerified: new Date() });
    const other = await makeUser(`${tag}o`, "Other Person", { emailVerified: new Date() });
    ids.push(admin.id, stu.id, other.id);
    const actor = { id: admin.id, email: admin.email };
    const row = await createScholarshipCode({ email: stu.email.toUpperCase(), percent: 30, actor });
    expect(row.code).toMatch(/^\d{16}$/);
    expect(row.assignedEmail).toBe(stu.email.toLowerCase());

    await expect(claimScholarshipCode(other.id, row.code)).rejects.toThrow(/isn't valid for this account/);
    expect(await getDiscountPercent(other.id, "TERM_6")).toBe(0);

    const res = await claimScholarshipCode(stu.id, row.code.replace(/(\d{4})/g, "$1 "));
    expect(res.percent).toBe(30);
    // Only the 6 Month plan is discounted. Every other length is untouched.
    expect(await getDiscountPercent(stu.id, "TERM_6")).toBe(30);
    for (const t of ["MONTHLY", "TERM_3", "TERM_12"]) expect(await getDiscountPercent(stu.id, t)).toBe(0);

    await expect(claimScholarshipCode(stu.id, row.code)).rejects.toThrow(/already been claimed/);
  });

  it("reprices a running 6 Month plan at claim time, leaves a 3 Month plan alone, and ending the discount restores the price", async () => {
    const admin = await makeUser(`${tag}a2`, "Owner Two", { role: "ADMIN" });
    const six = await makeUser(`${tag}s6`, "Six Month", { emailVerified: new Date() });
    const three = await makeUser(`${tag}s3`, "Three Month", { emailVerified: new Date() });
    ids.push(admin.id, six.id, three.id);
    const actor = { id: admin.id, email: admin.email };
    const sixPlan = await plan(six.id, "TERM_6", 18999);
    const threePlan = await plan(three.id, "TERM_3", 19999);

    const c6 = await createScholarshipCode({ email: six.email, percent: 40, actor });
    const c3 = await createScholarshipCode({ email: three.email, percent: 40, actor });
    await claimScholarshipCode(six.id, c6.code);
    await claimScholarshipCode(three.id, c3.code);

    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: sixPlan.id } })).installmentAmountCents).toBe(discountedPlanPriceCents(18999, 40));
    expect((await prisma.paymentPlan.findUniqueOrThrow({ where: { id: threePlan.id } })).installmentAmountCents).toBe(19999);

    await revokeScholarshipCode(c6.id, actor); // ends a claimed discount
    expect(await getDiscountPercent(six.id, "TERM_6")).toBe(0);
    expect(await prisma.paymentPlan.findUniqueOrThrow({ where: { id: sixPlan.id } })).toMatchObject({ installmentAmountCents: 18999, listAmountCents: null });
  });

  it("takes the better of a scholarship and the owner's general discount, never both", async () => {
    const admin = await makeUser(`${tag}a3`, "Owner Three", { role: "ADMIN" });
    const stu = await makeUser(`${tag}sg`, "Both Discounts", { emailVerified: new Date() });
    ids.push(admin.id, stu.id);
    const actor = { id: admin.id, email: admin.email };
    await setAccountDiscount({ userId: stu.id, percent: 20, actor });
    const row = await createScholarshipCode({ email: stu.email, percent: 35, actor });
    await claimScholarshipCode(stu.id, row.code);
    expect(await getDiscountPercent(stu.id, "TERM_6")).toBe(35); // the better one
    expect(await getDiscountPercent(stu.id, "TERM_3")).toBe(20); // the general one still prices other lengths
    const list = calculatePaymentPlanRate(OFFERED_PLAN_CADENCE, "TERM_6").installmentAmountCents;
    expect(discountedPlanPriceCents(list, await getDiscountPercent(stu.id, "TERM_6"))).toBeLessThan(discountedPlanPriceCents(list, 20));
  });

  it("two claims at the same moment succeed once", async () => {
    const admin = await makeUser(`${tag}a4`, "Owner Four", { role: "ADMIN" });
    const stu = await makeUser(`${tag}s2`, "Student Two", { emailVerified: new Date() });
    ids.push(admin.id, stu.id);
    const row = await createScholarshipCode({ email: stu.email, percent: 10, actor: { id: admin.id, email: admin.email } });
    const results = await Promise.allSettled([claimScholarshipCode(stu.id, row.code), claimScholarshipCode(stu.id, row.code)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("refuses revoked, lapsed and unverified-email claims, and bad input", async () => {
    const admin = await makeUser(`${tag}a5`, "Owner Five", { role: "ADMIN" });
    const stu = await makeUser(`${tag}s7`, "Student Seven", { emailVerified: new Date() });
    const unv = await makeUser(`${tag}s8`, "Student Eight", { emailVerified: null });
    ids.push(admin.id, stu.id, unv.id);
    const actor = { id: admin.id, email: admin.email };
    const revoked = await createScholarshipCode({ email: stu.email, percent: 10, actor });
    await revokeScholarshipCode(revoked.id, actor);
    await expect(claimScholarshipCode(stu.id, revoked.code)).rejects.toBeInstanceOf(ScholarshipError);

    const lapsed = await createScholarshipCode({ email: stu.email, percent: 10, actor });
    await prisma.scholarshipCode.update({ where: { id: lapsed.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(claimScholarshipCode(stu.id, lapsed.code)).rejects.toBeInstanceOf(ScholarshipError);

    const forUnverified = await createScholarshipCode({ email: unv.email, percent: 10, actor });
    await expect(claimScholarshipCode(unv.id, forUnverified.code)).rejects.toThrow(/Verify your email/);

    await expect(claimScholarshipCode(stu.id, "123")).rejects.toThrow(/16 digits/);
    await expect(claimScholarshipCode(stu.id, "0000000000000000")).rejects.toThrow(/isn't valid/);
    for (const percent of [0, 91, 1.5]) await expect(createScholarshipCode({ email: stu.email, percent, actor })).rejects.toThrow(/1 to 90/);
    expect(await getDiscountPercent(stu.id, "TERM_6")).toBe(0);
  });

  it("needs an existing student account, takes a custom code, and lets the owner edit or re-digit only unclaimed codes", async () => {
    const admin = await makeUser(`${tag}a6`, "Owner Six", { role: "ADMIN" });
    const stu = await makeUser(`${tag}s9`, "Student Nine", { emailVerified: new Date() });
    ids.push(admin.id, stu.id);
    const actor = { id: admin.id, email: admin.email };
    expect(await findScholarshipAccount(`nobody-${tag}@example.com`)).toBeNull();
    expect((await findScholarshipAccount(stu.email.toUpperCase()))?.id).toBe(stu.id);
    await expect(createScholarshipCode({ email: `nobody-${tag}@example.com`, percent: 20, actor })).rejects.toThrow(/No student account/);
    await expect(createScholarshipCode({ email: admin.email, percent: 20, actor })).rejects.toThrow(/No student account/);
    await expect(createScholarshipCode({ email: stu.email, percent: 20, code: "12ab", actor })).rejects.toThrow(/16 digits/);

    const custom = `${String(Date.now()).padStart(13, "0")}555`.slice(-16);
    const row = await createScholarshipCode({ email: stu.email, percent: 20, code: custom, actor });
    expect(row.code).toBe(custom);
    await expect(createScholarshipCode({ email: stu.email, percent: 20, code: custom, actor })).rejects.toThrow(/already exists/);

    await updateScholarshipCode(row.id, { percent: 55, note: "bigger" }, actor);
    expect((await prisma.scholarshipCode.findUniqueOrThrow({ where: { id: row.id } })).percent).toBe(55);
    const fresh = await regenerateScholarshipCode(row.id, actor);
    expect(fresh).not.toBe(custom);
    await expect(claimScholarshipCode(stu.id, custom)).rejects.toThrow(/isn't valid/);
    expect((await claimScholarshipCode(stu.id, fresh)).percent).toBe(55);
    await expect(updateScholarshipCode(row.id, { percent: 10 }, actor)).rejects.toThrow(/unclaimed/);
    await expect(regenerateScholarshipCode(row.id, actor)).rejects.toThrow(/unclaimed/);
  });
});

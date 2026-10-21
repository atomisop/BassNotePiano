import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { drawDownCredits, expireDueCreditGrants, grantCredits, warnExpiringSoonCreditGrants } from "@/lib/creditLedger";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("cl");
const ids: string[] = [];
let n = 0;
const DAY = 86_400_000;
const user = async (classCredits = 0) => {
  const u = await makeUser(`${tag}${n++}`, "Ledger Tester", { classCredits });
  ids.push(u.id);
  return u;
};
const balance = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).classCredits;

afterAll(async () => {
  await prisma.classBooking.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.classSchedule.deleteMany({ where: { label: { startsWith: tag } } });
  await prisma.creditGrant.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("grantCredits and drawDownCredits", () => {
  it("adds to the balance and records a grant; a draw-down spends the soonest-expiring grant first", async () => {
    const u = await user();
    await grantCredits(u.id, 8, { source: "PAYMENT_PLAN_INSTALLMENT", expiresAt: new Date(Date.now() + 30 * DAY) });
    await grantCredits(u.id, 4, { source: "PAYMENT_PLAN_INSTALLMENT", expiresAt: new Date(Date.now() + 5 * DAY) });
    await grantCredits(u.id, 2, { source: "ADMIN_ADJUSTMENT", expiresAt: null });
    expect(await balance(u.id)).toBe(14);

    await drawDownCredits(u.id, 5);
    const grants = await prisma.creditGrant.findMany({ where: { userId: u.id }, orderBy: { creditsGranted: "desc" } });
    const left = Object.fromEntries(grants.map((g) => [g.creditsGranted, g.creditsRemaining]));
    expect(left[4]).toBe(0); // soonest expiry spent first
    expect(left[8]).toBe(7); // then the next soonest
    expect(left[2]).toBe(2); // a non-expiring grant is spent last
  });

  it("a draw-down bigger than the ledger never throws or goes negative", async () => {
    const u = await user();
    await grantCredits(u.id, 2, { source: "ADMIN_ADJUSTMENT", expiresAt: null });
    await drawDownCredits(u.id, 50);
    expect((await prisma.creditGrant.findFirstOrThrow({ where: { userId: u.id } })).creditsRemaining).toBe(0);
    await drawDownCredits(u.id, 0); // nothing to do
  });
});

describe("expireDueCreditGrants", () => {
  it("takes unused credits off the balance once, and leaves a non-due grant alone", async () => {
    const u = await user();
    await grantCredits(u.id, 6, { source: "PAYMENT_PLAN_INSTALLMENT", expiresAt: new Date(Date.now() - 1000) });
    await grantCredits(u.id, 4, { source: "PAYMENT_PLAN_INSTALLMENT", expiresAt: new Date(Date.now() + 10 * DAY) });
    const first = (await expireDueCreditGrants()).filter((s) => s.userId === u.id);
    expect(first).toHaveLength(1);
    expect(first[0].creditsExpired).toBe(6);
    expect(await balance(u.id)).toBe(4);
    expect((await expireDueCreditGrants()).filter((s) => s.userId === u.id)).toHaveLength(0); // running it again changes nothing
    expect(await balance(u.id)).toBe(4);
  });

  it("never expires credits that an upcoming booked class is holding", async () => {
    const u = await user();
    const slot = await prisma.classSchedule.create({ data: { dayOfWeek: 2, startTime: "10:00", durationMin: 45, creditCost: 2, label: `${tag} slot` } });
    await grantCredits(u.id, 6, { source: "PAYMENT_PLAN_INSTALLMENT", expiresAt: new Date(Date.now() - 1000) });
    await prisma.classBooking.create({ data: { studentId: u.id, scheduleId: slot.id, occurrenceDate: new Date(Date.UTC(2031, 5, 3)), scheduledAt: new Date(Date.now() + 3 * DAY), creditsSpent: 2 } });
    const done = (await expireDueCreditGrants()).filter((s) => s.userId === u.id);
    expect(done[0]?.creditsExpired).toBe(4); // the 2 held by the class stay
    expect(await balance(u.id)).toBe(2);
    expect(await balance(u.id)).toBeGreaterThanOrEqual(0);
  });

  it("floors at the real balance when the ledger has drifted high", async () => {
    const u = await user(1);
    await prisma.creditGrant.create({ data: { userId: u.id, source: "PAYMENT_PLAN_INSTALLMENT", creditsGranted: 9, creditsRemaining: 9, expiresAt: new Date(Date.now() - 1000) } });
    await expireDueCreditGrants();
    expect(await balance(u.id)).toBe(0);
  });
});

describe("warnExpiringSoonCreditGrants", () => {
  it("warns about a grant nearing its end exactly once", async () => {
    const u = await user();
    await grantCredits(u.id, 3, { source: "PAYMENT_PLAN_INSTALLMENT", expiresAt: new Date(Date.now() + 1 * DAY) });
    await grantCredits(u.id, 3, { source: "PAYMENT_PLAN_INSTALLMENT", expiresAt: new Date(Date.now() + 90 * DAY) });
    const first = (await warnExpiringSoonCreditGrants()).filter((s) => s.userId === u.id);
    expect(first).toHaveLength(1);
    expect(first[0].creditsRemaining).toBe(3);
    expect((await warnExpiringSoonCreditGrants()).filter((s) => s.userId === u.id)).toHaveLength(0);
  });
});

import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { adjustUserCredits, CreditAdjustmentError, getUserCreditHistory } from "@/lib/creditAdjustments";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("ca");
const ids: string[] = [];
const balance = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).classCredits;

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.creditAdjustment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.creditGrant.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("adjustUserCredits", () => {
  it("grants and deducts, writes an audit row each time, records the grant (the student notice is not asserted: it is routed to Mail)", async () => {
    const admin = await makeUser(`${tag}a`, "Admin Person", { role: "ADMIN" });
    const stu = await makeUser(`${tag}s`, "Student Person", { classCredits: 4 });
    ids.push(admin.id, stu.id);

    expect((await adjustUserCredits(admin.id, stu.id, 6, "Makeup class")).balance).toBe(10);
    expect(await prisma.creditGrant.count({ where: { userId: stu.id, source: "ADMIN_ADJUSTMENT" } })).toBe(1);
    expect((await adjustUserCredits(admin.id, stu.id, -3, "Correction")).balance).toBe(7);
    expect(await balance(stu.id)).toBe(7);

    const history = await getUserCreditHistory(stu.id);
    expect(history.map((h) => h.amount).sort((a, b) => a - b)).toEqual([-3, 6]);
  });

  it("rejects zero, fractions, a missing reason, and a deduction that would go below zero, changing nothing", async () => {
    const admin = await makeUser(`${tag}a2`, "Admin Two", { role: "ADMIN" });
    const stu = await makeUser(`${tag}s2`, "Student Two", { classCredits: 2 });
    ids.push(admin.id, stu.id);
    for (const amount of [0, 1.5, NaN]) await expect(adjustUserCredits(admin.id, stu.id, amount, "x")).rejects.toBeInstanceOf(CreditAdjustmentError);
    await expect(adjustUserCredits(admin.id, stu.id, 2, "   ")).rejects.toBeInstanceOf(CreditAdjustmentError);
    await expect(adjustUserCredits(admin.id, stu.id, -3, "too much")).rejects.toThrow(/below 0/);
    expect(await balance(stu.id)).toBe(2);
    expect(await prisma.creditAdjustment.count({ where: { userId: stu.id } })).toBe(0);
  });

  it("two deductions at once cannot take the balance below zero", async () => {
    const admin = await makeUser(`${tag}a3`, "Admin Three", { role: "ADMIN" });
    const stu = await makeUser(`${tag}s3`, "Student Three", { classCredits: 2 });
    ids.push(admin.id, stu.id);
    const results = await Promise.allSettled([adjustUserCredits(admin.id, stu.id, -2, "a"), adjustUserCredits(admin.id, stu.id, -2, "b")]);
    expect(await balance(stu.id)).toBeGreaterThanOrEqual(0);
    expect(results.filter((r) => r.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
  });
});

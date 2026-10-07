import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { approveZellePayment, rejectZellePayment, getAdminPayments, markAllPaymentsChecked } from "@/lib/payments";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("py");
let admin: { id: string }, stu: { id: string };
const paymentIds: string[] = [];

async function pending(extra: Record<string, unknown> = {}) {
  const p = await prisma.zellePayment.create({
    data: { userId: stu.id, purpose: "CLASS_CREDITS", lessonQuantity: 4, amountCents: 11000, zelleHandle: "pay@example.com", status: "PENDING_REVIEW", submittedAt: new Date(), ...extra },
  });
  paymentIds.push(p.id);
  return p;
}

beforeAll(async () => {
  admin = await makeUser(tag, "Teacher", { role: "ADMIN" });
  stu = await makeUser(tag, "Pay Student", { classCredits: 0 });
});
afterAll(async () => {
  await prisma.creditGrant.deleteMany({ where: { userId: stu.id } });
  await prisma.notification.deleteMany({ where: { userId: { in: [admin.id, stu.id] } } });
  await prisma.mailMessage.deleteMany({ where: { userId: { in: [admin.id, stu.id] } } });
  await prisma.zellePayment.deleteMany({ where: { id: { in: paymentIds } } });
  await prisma.user.deleteMany({ where: { id: { in: [admin.id, stu.id] } } });
});

describe("approving and rejecting a payment", () => {
  it("approval verifies it, grants the credits once, and cannot be repeated", async () => {
    const p = await pending();
    await approveZellePayment(p.id, admin.id);
    const after = await prisma.zellePayment.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.status).toBe("VERIFIED");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: stu.id } })).classCredits).toBe(4);
    await expect(approveZellePayment(p.id, admin.id)).rejects.toThrow(/not pending review/);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: stu.id } })).classCredits).toBe(4);
  });
  it("rejection records the reason and grants nothing", async () => {
    const p = await pending();
    await rejectZellePayment(p.id, admin.id, "Reference did not match");
    const after = await prisma.zellePayment.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.status).toBe("REJECTED");
    expect(after.rejectionReason).toBe("Reference did not match");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: stu.id } })).classCredits).toBe(4);
  });
  it("a payment can only be decided while it is pending", async () => {
    const waiting = await pending({ status: "AWAITING_TRANSFER" });
    await expect(approveZellePayment(waiting.id, admin.id)).rejects.toThrow(/not pending review/);
  });
});

describe("the admin payments list", () => {
  it("pages, and reports the total", async () => {
    const before = await getAdminPayments("PENDING_REVIEW", 1);
    for (let i = 0; i < 3; i++) await pending();
    const after = await getAdminPayments("PENDING_REVIEW", 1);
    expect(after.total).toBe(before.total + 3);
    expect(after.payments.length).toBeLessThanOrEqual(25);
    expect((await getAdminPayments("PENDING_REVIEW", 9999)).page).toBe(after.pageCount);
    expect((await getAdminPayments("PENDING_REVIEW", -4)).page).toBe(1);
  });
  it("mark all as checked clears the Unchecked list", async () => {
    await pending({ status: "VERIFIED", autoApproved: true });
    await pending({ status: "VERIFIED", autoApproved: true });
    expect((await getAdminPayments("UNCHECKED")).total).toBeGreaterThanOrEqual(2);
    await markAllPaymentsChecked();
    expect((await getAdminPayments("UNCHECKED")).total).toBe(0);
  });
});

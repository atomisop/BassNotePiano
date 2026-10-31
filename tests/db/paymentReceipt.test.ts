import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
// A made-up owner, set before anything reads OWNER_EMAIL, so a test never mails the real one.
vi.hoisted(() => {
  process.env.OWNER_EMAIL = "receipt-owner@example.com";
});
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { approveZellePayment } from "@/lib/payments";
import { loadPaymentReceipt } from "@/lib/paymentReceipt";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("rc");
let admin: { id: string }, stu: { id: string; email: string }, banned: { id: string; email: string };
const paymentIds: string[] = [];

async function pendingFor(userId: string) {
  const p = await prisma.zellePayment.create({
    data: { userId, purpose: "CLASS_CREDITS", lessonQuantity: 4, amountCents: 11000, zelleHandle: "pay@example.com", status: "PENDING_REVIEW", submittedAt: new Date(), senderName: "PAY STUDENT" },
  });
  paymentIds.push(p.id);
  return p;
}

const OWNER = "receipt-owner@example.com";
const ownerCopies = () => prisma.emailLog.findMany({ where: { to: OWNER, subject: { startsWith: "Copy: receipt BNP-" } } });
const receiptEmails = (to: string) => prisma.emailLog.findMany({ where: { to, subject: { startsWith: "Receipt BNP-" } } });

beforeAll(async () => {
  admin = await makeUser(tag, "Teacher", { role: "ADMIN" });
  stu = await makeUser(tag, "Pay Student");
  banned = await makeUser(tag, "Banned Payer");
});
afterAll(async () => {
  const ids = [admin.id, stu.id, banned.id];
  await prisma.emailLog.deleteMany({ where: { to: { in: [stu.email, banned.email, OWNER] } } });
  await prisma.adminNotificationSetting.deleteMany({ where: { kind: "RECEIPT_COPY" } });
  await prisma.creditGrant.deleteMany({ where: { userId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.mailMessage.deleteMany({ where: { userId: { in: ids } } });
  await prisma.zellePayment.deleteMany({ where: { id: { in: paymentIds } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("payment receipts", () => {
  it("approving a payment sends one receipt email, and no separate approval email", async () => {
    const p = await pendingFor(stu.id);
    await approveZellePayment(p.id, admin.id);
    const sent = await prisma.emailLog.findMany({ where: { to: stu.email } });
    expect(sent.map((e) => e.subject)).toEqual([expect.stringMatching(/^Receipt BNP-[A-Z0-9]{5}: \$110\.00 paid$/)]);
    // The bell notice is still there.
    expect(await prisma.mailMessage.count({ where: { userId: stu.id, title: "Payment approved" } })).toBe(1);
  });

  it("only a confirmed payment has a receipt", async () => {
    const p = await pendingFor(stu.id);
    expect(await loadPaymentReceipt(p.id)).toBeNull();
    await approveZellePayment(p.id, admin.id);
    const loaded = await loadPaymentReceipt(p.id);
    expect(loaded?.receipt.amountLabel).toBe("$110.00");
    expect(loaded?.receipt.rows.find((r) => r.label === "Paid by")?.value).toBe("Pay Student");
  });

  it("a banned account is sent no receipt", async () => {
    const p = await pendingFor(banned.id);
    await prisma.user.update({ where: { id: banned.id }, data: { bannedAt: new Date() } });
    await approveZellePayment(p.id, admin.id);
    expect(await receiptEmails(banned.email)).toEqual([]);
  });

  it("emails the owner a copy, until the owner switches copies off", async () => {
    const before = (await ownerCopies()).length;
    const p = await pendingFor(stu.id);
    await approveZellePayment(p.id, admin.id);
    const copies = await ownerCopies();
    expect(copies.length).toBe(before + 1);
    expect(copies.at(-1)?.subject).toMatch(/^Copy: receipt BNP-[A-Z0-9]{5}, \$110\.00 from Pay Student$/);

    await prisma.adminNotificationSetting.upsert({ where: { kind: "RECEIPT_COPY" }, update: { ownerEnabled: false }, create: { kind: "RECEIPT_COPY", employeesEnabled: false, ownerEnabled: false } });
    const q = await pendingFor(stu.id);
    await approveZellePayment(q.id, admin.id);
    expect((await ownerCopies()).length).toBe(before + 1);
  });
});

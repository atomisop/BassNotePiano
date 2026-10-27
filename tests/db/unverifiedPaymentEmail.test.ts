import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { holdUnverifiedPaymentEmail } from "@/lib/paymentEmail";
import { paymentReferenceCode } from "@/lib/paymentReference";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("ue");
const ids: string[] = [];
let n = 0;
const sofi = (cents: number, note: string) => ({
  messageId: `<${tag}-${n++}@sofi.org>`,
  from: "SoFi <no-reply@o.sofi.org>",
  subject: "Money is on its way",
  body: `Hi,\nThe $${(cents / 100).toFixed(2)} sent to you by Pat Parent will be automatically deposited to your account.\n${note}\nSoFi is not responsible for the content.`,
  reason: "its signature check did not pass (Mailgun reported \"fail\")",
});
async function openPayment(cents: number) {
  const user = await makeUser(`${tag}${ids.length}`, "Payer Tester");
  ids.push(user.id);
  return prisma.zellePayment.create({ data: { userId: user.id, purpose: "CLASS_CREDITS", lessonQuantity: 2, amountCents: cents, zelleHandle: "pay@example.com", status: "AWAITING_TRANSFER" } });
}

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.zellePayment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("a forwarded bank email that failed the signature check", () => {
  it("with a real code and the exact amount, puts that payment in front of the owner and approves nothing", async () => {
    const payment = await openPayment(32998);
    const outcome = await holdUnverifiedPaymentEmail(sofi(32998, `Message: ${paymentReferenceCode(payment.id)}`));
    expect(outcome).toBe("held");
    const after = await prisma.zellePayment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(after.status).toBe("PENDING_REVIEW");
    expect(after.note).toMatch(/could not be verified/);
    expect(after.autoApproved).toBe(false);
  });

  it("a right code with the wrong amount, or no code at all, stays ignored", async () => {
    const payment = await openPayment(12345);
    expect(await holdUnverifiedPaymentEmail(sofi(99999, `Message: ${paymentReferenceCode(payment.id)}`))).toBe("rejected");
    expect(await holdUnverifiedPaymentEmail(sofi(12345, "thanks"))).toBe("rejected");
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("AWAITING_TRANSFER");
  });

  it("a code that is not any open payment's stays ignored", async () => {
    await openPayment(55555);
    expect(await holdUnverifiedPaymentEmail(sofi(55555, "Message: BNP-ZZZZZ"))).toBe("rejected");
  });
});

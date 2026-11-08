import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { ingestPaymentEmail } from "@/lib/paymentEmail";
import { paymentReferenceCode } from "@/lib/paymentReference";
import { makeUser, newTag, prisma } from "./helpers";

/**
 * P0-SEC-01: the same bank email delivered many times at the same instant (a retrying mail provider, a replayed webhook).
 * The payment must settle once and the credits must be granted once.
 */
const tag = newTag("per");
const userIds: string[] = [];
const paymentIds: string[] = [];

afterAll(async () => {
  await prisma.creditGrant.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.processedPaymentEmail.deleteMany({ where: { messageId: { startsWith: tag.toLowerCase() } } });
  await prisma.zellePayment.deleteMany({ where: { id: { in: paymentIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});
beforeAll(() => undefined);

describe("replayed payment email", () => {
  it("five identical deliveries at once settle the payment once and grant credits once", async () => {
    const user = await makeUser(tag, "Replay Rita", { classCredits: 0 });
    userIds.push(user.id);
    const payment = await prisma.zellePayment.create({
      data: { userId: user.id, purpose: "CLASS_CREDITS", lessonQuantity: 2, amountCents: 8099, zelleHandle: "pay@example.com", status: "PENDING_REVIEW", submittedAt: new Date() },
    });
    paymentIds.push(payment.id);

    const email = {
      messageId: `${tag}-same-message`,
      from: "Bank of America <alerts@bankofamerica.com>",
      subject: "Replay Rita sent you $80.99",
      body: `Replay Rita sent you $80.99\n${paymentReferenceCode(payment.id)}\nView your balance`,
    };
    const results = await Promise.allSettled([1, 2, 3, 4, 5].map(() => ingestPaymentEmail(email)));

    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    const outcomes = results.map((r) => (r as PromiseFulfilledResult<string>).value);
    expect(outcomes.filter((o) => o === "duplicate")).toHaveLength(4);

    const after = await prisma.zellePayment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(after.status).toBe("VERIFIED");
    const received = await prisma.processedPaymentEmail.count({ where: { messageId: { startsWith: tag.toLowerCase() } } });
    expect(received).toBe(1);
    // The control: the same payment for another student, delivered exactly once. The replayed student must end up with the same credits.
    const control = await makeUser(tag, "Control Carla", { classCredits: 0 });
    userIds.push(control.id);
    const controlPayment = await prisma.zellePayment.create({
      data: { userId: control.id, purpose: "CLASS_CREDITS", lessonQuantity: 2, amountCents: 8099, zelleHandle: "pay@example.com", status: "PENDING_REVIEW", submittedAt: new Date() },
    });
    paymentIds.push(controlPayment.id);
    await ingestPaymentEmail({ ...email, messageId: `${tag}-control`, subject: "Control Carla sent you $80.99", body: `Control Carla sent you $80.99\n${paymentReferenceCode(controlPayment.id)}\nView your balance` });

    const [replayed, once] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { classCredits: true } }),
      prisma.user.findUniqueOrThrow({ where: { id: control.id }, select: { classCredits: true } }),
    ]);
    expect(once.classCredits).toBeGreaterThan(0);
    expect(replayed.classCredits).toBe(once.classCredits);
  });
});

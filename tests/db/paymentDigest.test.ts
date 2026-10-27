import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { getPaymentDigestFacts } from "@/lib/paymentDigest";
import { paymentReferenceCode } from "@/lib/paymentReference";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("dg");
const userIds: string[] = [];
const receiptIds: string[] = [];
afterAll(async () => {
  await prisma.processedPaymentEmail.deleteMany({ where: { id: { in: receiptIds } } });
  await prisma.zellePayment.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("the morning email's payment facts", () => {
  it("counts payments waiting over a day, and unmatched emails that already have a likely payment", async () => {
    const before = await getPaymentDigestFacts();
    const user = await makeUser(tag, "Digest Tester");
    userIds.push(user.id);
    const old = await prisma.zellePayment.create({ data: { userId: user.id, purpose: "CLASS_CREDITS", lessonQuantity: 2, amountCents: 77777, zelleHandle: "p@example.com", status: "PENDING_REVIEW", submittedAt: new Date(Date.now() - 30 * 3_600_000) } });
    const receipt = await prisma.processedPaymentEmail.create({ data: { messageId: `<${tag}@x>`, method: "ZELLE", senderName: "Someone Else", amountCents: 77777, memo: paymentReferenceCode(old.id), createdAt: new Date(Date.now() - 2 * 86_400_000) } });
    receiptIds.push(receipt.id);
    const after = await getPaymentDigestFacts();
    expect(after.waitingOverDay).toBe(before.waitingOverDay + 1);
    expect(after.likelyMatches).toBe(before.likelyMatches + 1);
  });
});

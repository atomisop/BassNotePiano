import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHmac } from "crypto";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { POST } from "@/app/api/inbound/payments/route";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("ip");
const KEY = "test-signing-key";
const TOKEN = "0123456789abcdef01234567";
const userIds: string[] = [];
const paymentIds: string[] = [];
let counter = 0;

beforeAll(() => {
  process.env.MAILGUN_SIGNING_KEY = KEY;
  process.env.PAYMENT_INBOX_TOKEN = TOKEN;
});
afterAll(async () => {
  await prisma.processedPaymentEmail.deleteMany({ where: { messageId: { startsWith: tag } } });
  await prisma.zellePayment.deleteMany({ where: { id: { in: paymentIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.appSetting.deleteMany({ where: { key: { startsWith: `payment-email-rejected:${tag}` } } });
});

async function openPayment(name: string, amountCents: number) {
  const user = await makeUser(`${tag}x${++counter}`, name, { classCredits: 0 });
  userIds.push(user.id);
  const p = await prisma.zellePayment.create({
    data: { userId: user.id, purpose: "CLASS_CREDITS", lessonQuantity: 2, amountCents, zelleHandle: "pay@example.com", status: "PENDING_REVIEW", submittedAt: new Date() },
  });
  paymentIds.push(p.id);
  return p;
}

/** One delivery as Mailgun makes it: a signed form post. */
function delivery(over: { recipient?: string; dkim?: string; signedBy?: string; messageId?: string; from?: string; subject: string; body: string }) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const token = `t${++counter}`;
  const form = new FormData();
  form.set("timestamp", timestamp);
  form.set("token", token);
  form.set("signature", createHmac("sha256", KEY).update(timestamp + token).digest("hex"));
  form.set("recipient", over.recipient ?? `pay-${TOKEN}@inbox.bassnotepiano.com`);
  form.set("from", over.from ?? "Bank of America <alerts@ealerts.bankofamerica.com>");
  form.set("subject", over.subject);
  form.set("body-plain", over.body);
  form.set(
    "message-headers",
    JSON.stringify([
      ["Message-Id", over.messageId ?? `<${tag}-${counter}@ealerts.bankofamerica.com>`],
      ["X-Mailgun-Dkim-Check-Result", over.dkim ?? "Pass"],
      ["DKIM-Signature", `v=1; a=rsa-sha256; d=${over.signedBy ?? "bankofamerica.com"}; s=x; b=abc`],
    ]),
  );
  return POST(new Request("http://localhost/api/inbound/payments", { method: "POST", body: form }));
}

const json = async (r: Response) => (await r.json()) as { outcome?: string; error?: string };

describe("bank emails forwarded to the private payments address", () => {
  it("approves a payment when the email is signed by the bank and matches by name and amount", async () => {
    const p = await openPayment("Jo Rivera", 19999);
    const res = await delivery({ subject: "Jo Rivera sent you $199.99", body: "Jo Rivera sent you $199.99\nView your balance" });
    expect(await json(res)).toEqual({ outcome: "approved" });
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("VERIFIED");
  });

  it("treats the same email as a duplicate however its id is written", async () => {
    await openPayment("Kim Alvarez", 24999);
    const id = `${tag}-same@ealerts.bankofamerica.com`;
    const first = await delivery({ messageId: `<${id.toUpperCase()}>`, subject: "Kim Alvarez sent you $249.99", body: "Kim Alvarez sent you $249.99" });
    expect((await json(first)).outcome).toBe("approved");
    const again = await delivery({ messageId: id, subject: "Kim Alvarez sent you $249.99", body: "Kim Alvarez sent you $249.99" });
    expect((await json(again)).outcome).toBe("duplicate");
  });

  it("refuses an email whose signature check failed, or that is signed by someone else, and does not approve it", async () => {
    const p = await openPayment("Lee Okafor", 12999);
    const failed = await delivery({ dkim: "Fail", subject: "Lee Okafor sent you $129.99", body: "Lee Okafor sent you $129.99" });
    expect((await json(failed)).outcome).toBe("rejected");
    const forged = await delivery({ signedBy: "attacker.com", subject: "Lee Okafor sent you $129.99", body: "Lee Okafor sent you $129.99" });
    expect((await json(forged)).outcome).toBe("rejected");
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("PENDING_REVIEW");
    expect(await prisma.appSetting.count({ where: { key: { startsWith: `payment-email-rejected:${tag}` } } })).toBeGreaterThanOrEqual(1);
  });

  it("ignores mail for any other address, from a non-bank sender, or with a bad request signature", async () => {
    const other = await delivery({ recipient: "music@inbox.bassnotepiano.com", subject: "x sent you $1.00", body: "x" });
    expect((await json(other)).outcome).toBe("ignored");
    const notBank = await delivery({ from: "Scammer <pay@evil.com>", subject: "Jo sent you $1.00", body: "Jo sent you $1.00" });
    expect((await json(notBank)).outcome).toBe("ignored");

    const form = new FormData();
    form.set("timestamp", String(Math.floor(Date.now() / 1000)));
    form.set("token", "t");
    form.set("signature", "nope");
    const forbidden = await POST(new Request("http://localhost/api/inbound/payments", { method: "POST", body: form }));
    expect(forbidden.status).toBe(403);
  });
});

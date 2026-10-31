// Sends a signed, Mailgun-style test bank email to a payments webhook, the way a forwarded SoFi email arrives. For STAGING.
//   MAILGUN_SIGNING_KEY=... PAYMENT_INBOX_TOKEN=... node scripts/send-test-bank-email.mjs <baseUrl> <BNP-CODE> <amountCents> [pass|soft|fail]
// pass: Mailgun's DKIM check passed. soft: no verdict, but the bank's signature and Gmail's pass are on the message. fail: Mailgun says fail.
import { createHmac, randomUUID } from "node:crypto";

export async function sendTestBankEmail({ baseUrl, code, amountCents, mode = "pass", senderName = "Pat Parent", signingKey, inboxToken }) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const token = randomUUID().replace(/-/g, "");
  const signature = createHmac("sha256", signingKey).update(timestamp + token).digest("hex");
  const messageId = `<smoke-${randomUUID()}@o.sofi.org>`;
  const headers = [
    ["Message-Id", messageId],
    ["From", "SoFi <no-reply@o.sofi.org>"],
    ["DKIM-Signature", "v=1; a=rsa-sha256; d=o.sofi.org; s=smoke; b=test"],
  ];
  if (mode === "pass") headers.push(["X-Mailgun-Dkim-Check-Result", "Pass"]);
  if (mode === "fail") headers.push(["X-Mailgun-Dkim-Check-Result", "Fail"]);
  if (mode === "soft") headers.push(["ARC-Authentication-Results", "i=1; mx.google.com; dkim=pass header.i=@o.sofi.org header.s=smoke"]);
  const body = `Hi,\nThe $${(amountCents / 100).toFixed(2)} sent to you by ${senderName} will be automatically deposited to your account.\nMessage: ${code}\nSoFi is not responsible for the content.`;
  const form = new FormData();
  for (const [k, v] of Object.entries({ timestamp, token, signature, recipient: `pay-${inboxToken}@inbox.bassnotepiano.com`, from: "SoFi <no-reply@o.sofi.org>", sender: "no-reply@o.sofi.org", subject: `Notification - ${senderName.toUpperCase()} sent you $${(amountCents / 100).toFixed(2)}.`, "body-plain": body, "message-headers": JSON.stringify(headers) })) form.set(k, v);
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/inbound/payments`, { method: "POST", body: form });
  return { status: res.status, json: await res.json().catch(() => null) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [baseUrl, code, cents, mode] = process.argv.slice(2);
  if (!baseUrl || !code || !cents) {
    console.error("Usage: node scripts/send-test-bank-email.mjs <baseUrl> <BNP-CODE> <amountCents> [pass|soft|fail]");
    process.exit(1);
  }
  const result = await sendTestBankEmail({ baseUrl, code, amountCents: Number(cents), mode, signingKey: process.env.MAILGUN_SIGNING_KEY, inboxToken: process.env.PAYMENT_INBOX_TOKEN });
  console.log(JSON.stringify(result));
}

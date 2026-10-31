import { assert, env, makeSuite } from "./harness.mjs";
import { sendTestBankEmail } from "../send-test-bank-email.mjs";

const suite = makeSuite("5. Payments pipeline");
const token = () => env("STAGING_SMOKE_TOKEN");

async function open(ctx) {
  const res = await fetch(`${ctx.base}/api/staging/open-test-payment`, { method: "POST", headers: { "x-smoke-token": token() } });
  assert(res.status === 200, `could not open a test payment (${res.status}); is the staging seed run and APP_ENV=staging?`);
  return res.json();
}
async function status(ctx, id) {
  const res = await fetch(`${ctx.base}/api/staging/open-test-payment?id=${id}`, { headers: { "x-smoke-token": token() } });
  return res.json();
}
const mail = (ctx, p, mode, extra = {}) => sendTestBankEmail({ baseUrl: ctx.base, code: p.code, amountCents: p.amountCents, mode, signingKey: env("MAILGUN_SIGNING_KEY"), inboxToken: env("PAYMENT_INBOX_TOKEN"), ...extra });

suite.step("a verified bank email with the code approves the payment", async (ctx) => {
  const p = await open(ctx);
  const sent = await mail(ctx, p, "pass");
  assert(sent.json?.outcome === "approved", `outcome was ${JSON.stringify(sent.json)}`);
  assert((await status(ctx, p.paymentId)).status === "VERIFIED", "the payment is not verified");
});
suite.step("an email with no verdict but the bank's signature and Gmail's pass approves it and leaves it unchecked", async (ctx) => {
  const p = await open(ctx);
  const sent = await mail(ctx, p, "soft");
  assert(sent.json?.outcome === "approved", `outcome was ${JSON.stringify(sent.json)}`);
  const s = await status(ctx, p.paymentId);
  assert(s.status === "VERIFIED" && s.unchecked === true, `status ${JSON.stringify(s)}`);
});
suite.step("a failed-signature email with the code only holds the payment for the owner", async (ctx) => {
  const p = await open(ctx);
  const sent = await mail(ctx, p, "fail");
  assert(sent.json?.outcome === "held", `outcome was ${JSON.stringify(sent.json)}`);
  const s = await status(ctx, p.paymentId);
  assert(s.status === "PENDING_REVIEW", `status ${JSON.stringify(s)}`);
});
suite.step("an email for the wrong amount is not matched", async (ctx) => {
  const p = await open(ctx);
  const sent = await mail(ctx, { ...p, amountCents: p.amountCents + 100 }, "pass");
  assert(sent.json?.outcome !== "approved", `a wrong amount was approved: ${JSON.stringify(sent.json)}`);
  assert((await status(ctx, p.paymentId)).status === "AWAITING_TRANSFER", "the payment changed");
});
suite.step("a request signed with the wrong key is refused", async (ctx) => {
  const p = await open(ctx);
  const sent = await mail(ctx, p, "pass", { signingKey: "not-the-real-signing-key" });
  assert(sent.status === 403, `expected 403, got ${sent.status}`);
  assert((await status(ctx, p.paymentId)).status === "AWAITING_TRANSFER", "the payment changed");
});

export default suite;

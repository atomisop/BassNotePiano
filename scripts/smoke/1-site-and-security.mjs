import { assert, makeSuite } from "./harness.mjs";

const suite = makeSuite("1. Site and security");
const get = (ctx, path, init = {}) => fetch(`${ctx.base}${path}`, { redirect: "manual", ...init });

for (const path of ["/", "/login", "/pricing", "/classes", "/terms", "/privacy", "/shop"]) {
  suite.step(`public page ${path} loads`, async (ctx) => {
    const res = await get(ctx, path);
    assert(res.status === 200, `${path} answered ${res.status}`);
    assert((res.headers.get("content-type") ?? "").includes("text/html"), `${path} is not HTML`);
  });
}
suite.step("an unknown page is a real 404", async (ctx) => assert((await get(ctx, "/no-such-page-smoke")).status === 404, "expected 404"));
suite.step("signed-out visitors are sent to sign in from the app", async (ctx) => {
  for (const path of ["/dashboard", "/lessons", "/parent", "/admin"]) {
    const res = await get(ctx, path);
    assert([301, 302, 303, 307, 308].includes(res.status) && /\/login/.test(res.headers.get("location") ?? ""), `${path} gave ${res.status} to ${res.headers.get("location")}`);
  }
});
suite.step("security headers are on", async (ctx) => {
  const h = (await get(ctx, "/login")).headers;
  assert(h.get("x-content-type-options") === "nosniff", "missing nosniff");
  assert(/deny/i.test(h.get("x-frame-options") ?? ""), "missing X-Frame-Options");
  assert(h.get("content-security-policy"), "missing Content-Security-Policy");
  assert(h.get("referrer-policy"), "missing Referrer-Policy");
  if (ctx.base.startsWith("https://")) assert(h.get("strict-transport-security"), "missing HSTS on https");
});
suite.step("the staging copy is hidden from search engines", async (ctx) => {
  if (!ctx.expectStaging) return;
  const html = await (await get(ctx, "/")).text();
  assert(/name="robots"[^>]*noindex/i.test(html) || /noindex[^>]*name="robots"/i.test(html), "no noindex tag on staging");
});
suite.step("the status API refuses a signed-out caller", async (ctx) => assert((await get(ctx, "/api/me/status")).status === 401, "expected 401"));
suite.step("the test-only payment endpoint is closed without the token", async (ctx) => {
  const res = await get(ctx, "/api/staging/open-test-payment", { method: "POST" });
  assert(res.status === 404, `expected 404, got ${res.status}`);
});
suite.step("a forged payment webhook is refused", async (ctx) => {
  const form = new FormData();
  for (const [k, v] of Object.entries({ timestamp: "1", token: "x", signature: "bad", recipient: "x@x.com", from: "a@b.com" })) form.set(k, v);
  const res = await fetch(`${ctx.base}/api/inbound/payments`, { method: "POST", body: form });
  assert([400, 403, 503].includes(res.status), `expected a refusal, got ${res.status}`);
});

export default suite;

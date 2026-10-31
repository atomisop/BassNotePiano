// Runs the five smoke checks against a deployed copy of the app (the staging site).
//   SMOKE_BASE_URL=https://staging--yoursite.netlify.app STAGING_SEED_PASSWORD=... STAGING_SMOKE_TOKEN=... MAILGUN_SIGNING_KEY=... PAYMENT_INBOX_TOKEN=... npm run smoke
// Optional: SMOKE_ONLY=1,4 runs only those checks. Exit code 1 if anything fails.
import { chromium } from "playwright-core";
import { env } from "./harness.mjs";
import s1 from "./1-site-and-security.mjs";
import s2 from "./2-sign-in.mjs";
import s3 from "./3-booking.mjs";
import s4 from "./4-parent-mode.mjs";
import s5 from "./5-payments-pipeline.mjs";

const base = env("SMOKE_BASE_URL").replace(/\/$/, "");
const password = env("STAGING_SEED_PASSWORD");
const only = (process.env.SMOKE_ONLY ?? "").split(",").map((n) => n.trim()).filter(Boolean);
const suites = [s1, s2, s3, s4, s5].filter((_, i) => only.length === 0 || only.includes(String(i + 1)));

const users = {
  student: { email: "student@bnp-test.local" },
  admin: { email: "admin@bnp-test.local" },
  parent: { email: "parent@bnp-test.local" },
  child: { email: "child@bnp-test.local" },
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const contexts = {};
const pages = {};
const ctx = {
  base,
  users,
  expectStaging: process.env.SMOKE_EXPECT_STAGING !== "0",
  newPage: async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    context.setDefaultTimeout(120000);
    return context.newPage();
  },
  async signIn(key) {
    if (contexts[key]) return;
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    context.setDefaultTimeout(120000);
    const page = await context.newPage();
    await page.goto(`${base}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(4000);
    await page.getByRole("button", { name: "Accept all" }).click().catch(() => undefined);
    await page.fill('input[type="email"]', users[key].email);
    await page.fill('input[type="password"]', password);
    await page.click('form button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 120000 });
    contexts[key] = context;
    pages[key] = page;
  },
  async pageFor(key) {
    await ctx.signIn(key);
    return pages[key];
  },
};

let all = [];
for (const suite of suites) {
  const results = await suite.run(ctx);
  all = all.concat(results);
  console.log(`\n${suite.title}`);
  for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : `\n        ${r.detail}`}`);
}
await browser.close();
const failed = all.filter((r) => !r.ok);
console.log(`\n${all.length - failed.length} of ${all.length} checks passed${failed.length ? `, ${failed.length} FAILED` : ""}.`);
process.exit(failed.length ? 1 : 0);

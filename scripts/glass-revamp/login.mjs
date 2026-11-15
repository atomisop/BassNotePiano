// Signs a LOCAL test account in (password + emailed code printed in the dev server log) and saves the session for captures.
// Usage: node scripts/glass-revamp/login.mjs <student|admin> <password> [code]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const [role, password, code] = process.argv.slice(2);
const email = role === "admin" ? "revamp-admin@bnp.test" : "revamp-student@bnp.test";
const base = process.env.E2E_BASE_URL ?? "http://localhost:3101";
if (!base.includes("localhost")) { console.error("local only"); process.exit(2); }
mkdirSync(".auth", { recursive: true });
const file = `.auth/${role}.json`;
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
{
  await page.goto(base + "/login", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(3000);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").first().fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);
  console.log("url", page.url());
  await ctx.storageState({ path: file });
  console.log("saved", file);
}
await browser.close();

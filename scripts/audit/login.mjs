// Signs a LOCAL seeded account in and saves the session to .auth/<name>.json. Usage: node scripts/audit/login.mjs <email> <password> <name>
import { chromium } from "@playwright/test";
const [email, password, name] = process.argv.slice(2);
const base = process.env.E2E_BASE_URL ?? "http://localhost:3101";
if (!base.includes("localhost")) { console.error("local only"); process.exit(2); }
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(base + "/login", { waitUntil: "load" });
await page.waitForTimeout(1500);
await page.getByLabel("Email").fill(email);
await page.getByLabel("Password").first().fill(password);
await page.getByRole("button", { name: "Log in", exact: true }).click();
await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2000);
console.log("url", page.url());
await ctx.storageState({ path: `.auth/${name}.json` });
await browser.close();

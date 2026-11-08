// Real screenshots of a running app for one task.
// Usage: node scripts/rework/capture.mjs <TASK-ID> <before|after|states> <path> [name] [--theme dark|light]
// Optional: E2E_SESSION_COOKIE = a session token from scripts/rework/test-session.mjs (fake student, throwaway DB only).
// Needs the app running (E2E_BASE_URL, default http://localhost:3000). Never fakes output: fails if the page errors.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const [task, phase, path, name = "page"] = process.argv.slice(2);
const theme = process.argv.includes("--theme") ? process.argv[process.argv.indexOf("--theme") + 1] : "dark";
if (!task || !["before", "after", "states"].includes(phase) || !path) {
  console.error("usage: capture.mjs <TASK-ID> <before|after|states> <path> [name] [--theme dark|light]");
  process.exit(2);
}
const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const sizes = [[1440, 900], [390, 844], [320, 700]];
const out = join("docs/rework/evidence", task, phase);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
let bad = false;
for (const [w, h] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, reducedMotion: "reduce" });
  if (process.env.E2E_SESSION_COOKIE) await ctx.addCookies([{ name: "next-auth.session-token", value: process.env.E2E_SESSION_COOKIE, url: base }]);
  const page = await ctx.newPage();
  const res = await page.goto(base + path, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(2500);
  if (!res || res.status() >= 400) { console.error(`${w}x${h}: HTTP ${res?.status()}`); bad = true; }
  const file = join(out, `${name}-${theme}-${w}x${h}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log("saved", file);
  await ctx.close();
}
await browser.close();
process.exit(bad ? 1 : 0);

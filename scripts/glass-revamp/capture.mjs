// Real screenshots of a running app for one task.
// Usage: node scripts/rework/capture.mjs <TASK-ID> <before|after|states> <path> [name] [--theme dark|light]
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
const base = process.env.E2E_BASE_URL ?? "http://localhost:3101";
const sizes = [[1440, 900], [390, 844], [320, 700]];
const out = join("docs/glass-revamp/evidence", task, phase);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
let bad = false;
for (const [w, h] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const res = await page.goto(base + path, { waitUntil: "networkidle" });
  if (!res || res.status() >= 400) { console.error(`${w}x${h}: HTTP ${res?.status()}`); bad = true; }
  await page.waitForTimeout(3500);
  const file = join(out, `${name}-${theme}-${w}x${h}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log("saved", file);
  await ctx.close();
}
await browser.close();
process.exit(bad ? 1 : 0);

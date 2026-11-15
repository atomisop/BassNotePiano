// Counts glass-role buttons and how many got a lens. Usage: node scripts/glass-revamp/role-check.mjs <out.json> <path...>  (student session, Chromium)
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
const out = process.argv[2]; const paths = process.argv.slice(3);
const base = process.env.E2E_BASE_URL ?? "http://localhost:3101";
if (!/localhost|127\.0\.0\.1/.test(base)) process.exit(2);
const b = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const rows = [];
for (const path of paths) {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark", reducedMotion: "reduce", storageState: ".auth/student.json" });
  const p = await c.newPage();
  await p.goto(base + path, { waitUntil: "domcontentloaded", timeout: 400000 });
  await p.waitForLoadState("load", { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(6000);
  const r = await p.evaluate(() => {
    const roles = [...document.querySelectorAll('[data-glass-role="button"]')];
    const visible = roles.filter((e) => e.offsetWidth > 0);
    return { roleButtons: roles.length, visible: visible.length, lensed: visible.filter((e) => e.classList.contains("lg-glass")).length, anyLensed: document.querySelectorAll(".lg-glass").length };
  });
  rows.push({ path, ...r }); console.log(path, r);
  await c.close();
}
await b.close();
writeFileSync(out, JSON.stringify(rows, null, 2));

// Checks that Tailwind backdrop-blur elements lose their blur in Solid and reduced transparency. Usage: node scripts/glass-revamp/blur-utility-check.mjs <out.json>
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
const base = process.env.E2E_BASE_URL ?? "http://localhost:3101";
if (!/localhost|127\.0\.0\.1/.test(base)) process.exit(2);
const b = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(ok ? "PASS" : "FAIL", name, detail); };
const count = (p) => p.evaluate(() => { const els = [...document.querySelectorAll('[class*="backdrop-blur"]')]; return { n: els.length, blurred: els.filter((e) => getComputedStyle(e).backdropFilter !== "none").length }; });
async function load(path, { solid = false, features = null } = {}) {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark", reducedMotion: "reduce", storageState: ".auth/student.json" });
  const p = await c.newPage();
  await p.addInitScript((s) => { try { localStorage.setItem("bnp-theme", "ink"); if (s) localStorage.setItem("bnp-solid-surfaces", "on"); } catch {} }, solid);
  if (features) await (await c.newCDPSession(p)).send("Emulation.setEmulatedMedia", { features });
  await p.goto(base + path, { waitUntil: "domcontentloaded", timeout: 400000 });
  await p.waitForLoadState("load", { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(4500);
  // The marketing nav only gets its blur once the page has scrolled.
  await p.mouse.wheel(0, 600);
  await p.waitForTimeout(1500);
  return { c, p };
}
for (const path of ["/dashboard", "/pricing"]) {
  let r = await load(path); const n0 = await count(r.p); await r.c.close();
  r = await load(path, { solid: true }); const s = await count(r.p); await r.c.close();
  r = await load(path, { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] }); const t = await count(r.p); await r.c.close();
  check(`${path}: has blur-utility elements in the normal look`, n0.n > 0 && n0.blurred > 0, JSON.stringify(n0));
  check(`${path}: Solid removes every utility blur`, s.n > 0 && s.blurred === 0, JSON.stringify(s));
  check(`${path}: reduced transparency removes every utility blur`, t.n > 0 && t.blurred === 0, JSON.stringify(t));
}
await b.close();
writeFileSync(process.argv[2], JSON.stringify(results, null, 2));
process.exit(results.every((r) => r.ok) ? 0 : 1);

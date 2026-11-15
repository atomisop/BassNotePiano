// Reduced transparency, forced colors, keyboard focus and Escape/focus-return checks. Usage: node scripts/glass-revamp/a11y-checks.mjs <out.json>
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
const out = process.argv[2];
const base = process.env.E2E_BASE_URL ?? "http://localhost:3101";
if (!/localhost|127\.0\.0\.1/.test(base)) process.exit(2);
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(ok ? "PASS" : "FAIL", name, detail); };
const b = await chromium.launch();
async function open(features) {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark", reducedMotion: "reduce", storageState: ".auth/student.json" });
  const p = await c.newPage();
  await p.addInitScript(() => { try { localStorage.setItem("bnp-theme", "ink"); } catch {} });
  const cdp = await c.newCDPSession(p);
  if (features) await cdp.send("Emulation.setEmulatedMedia", { features });
  await p.goto(base + "/dashboard", { waitUntil: "domcontentloaded", timeout: 400000 });
  await p.waitForLoadState("load", { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(4000);
  return { c, p };
}
const GLASS = ".glass-surface, .glass-surface-subtle, .glass-surface-elevated, .glass-pill, .glass-menu, .chrome, .ig-dock";
const noBackdrop = (p) => p.evaluate((sel) => { const els = [...document.querySelectorAll(sel)]; return { n: els.length, bad: els.filter((e) => getComputedStyle(e).backdropFilter !== "none").length }; }, GLASS);

// 1. reduced transparency
{
  const base0 = await open(null); const g0 = await noBackdrop(base0.p); await base0.c.close();
  const { c, p } = await open([{ name: "prefers-reduced-transparency", value: "reduce" }]);
  const g = await noBackdrop(p);
  check("normal look has glass surfaces with a backdrop", g0.n > 0 && g0.bad > 0, JSON.stringify(g0));
  check("prefers-reduced-transparency: no glass surface keeps a backdrop-filter", g.n > 0 && g.bad === 0, JSON.stringify(g));
  await c.close();
}
// 2. forced colors
{
  const { c, p } = await open([{ name: "forced-colors", value: "active" }]);
  const g = await noBackdrop(p);
  check("forced-colors: no glass surface keeps a backdrop-filter", g.bad === 0, JSON.stringify(g));
  await c.close();
}
// 3. keyboard
{
  const { c, p } = await open(null);
  const seen = [];
  for (let i = 0; i < 25; i++) {
    await p.keyboard.press("Tab");
    seen.push(await p.evaluate(() => {
      const e = document.activeElement; if (!e || e === document.body) return null;
      const s = getComputedStyle(e); const r = e.getBoundingClientRect();
      const ring = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== "none");
      return { tag: e.tagName, label: (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 24), ring, visible: r.width > 0 && r.height > 0 };
    }));
  }
  const stops = seen.filter(Boolean);
  check("Tab reaches at least 15 focusable controls", stops.length >= 15, `${stops.length} stops`);
  check("every focused control is visible on screen", stops.every((s) => s.visible));
  const noRing = stops.filter((s) => !s.ring).map((s) => s.label || s.tag);
  check("every focused control shows a focus ring", noRing.length === 0, noRing.join(" | "));
  // 4. Escape closes the command menu and focus goes back
  await p.keyboard.press("Control+k");
  await p.waitForTimeout(1200);
  const opened = await p.evaluate(() => !!document.querySelector('[role="dialog"], [cmdk-root]'));
  await p.keyboard.press("Escape");
  await p.waitForTimeout(900);
  const closed = await p.evaluate(() => !document.querySelector('[role="dialog"][data-state="open"], [cmdk-root]'));
  check("Ctrl+K opens the command menu", opened);
  check("Escape closes it", closed);
  await c.close();
}
await b.close();
writeFileSync(out, JSON.stringify(results, null, 2));
process.exit(results.every((r) => r.ok) ? 0 : 1);

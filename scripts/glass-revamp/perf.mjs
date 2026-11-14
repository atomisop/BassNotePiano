// Local, dev-server performance numbers for glass pages. Usage: node scripts/glass-revamp/perf.mjs <out.json> <role> [--solid] <paths...>
// Numbers come from a dev server on a shared machine: use them to compare before and after on the SAME machine, never as budgets.
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const out = args.shift(); const role = args.shift();
const solid = args.includes("--solid");
const paths = args.filter((a) => a.startsWith("/"));
const base = process.env.E2E_BASE_URL ?? "http://localhost:3101";
if (!/localhost|127\.0\.0\.1/.test(base)) { console.error("local only"); process.exit(2); }
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const rows = [];
for (const path of paths) for (const [w, h] of [[1440, 900], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: "dark", storageState: role === "guest" ? undefined : `.auth/${role}.json` });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__m = { lcp: 0, cls: 0 };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
  });
  const res = await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 150000 }).catch(() => null);
  if (!res || res.status() >= 400) { console.error("SKIPPED", path, w); await ctx.close(); continue; }
  await page.waitForLoadState("load", { timeout: 60000 }).catch(() => {});
  if (solid) await page.evaluate(() => document.documentElement.setAttribute("data-solid-surfaces", "on"));
  await page.waitForTimeout(4000);
  const m = await page.evaluate(() => ({
    ...window.__m,
    backdropEls: [...document.querySelectorAll("*")].filter((e) => { const s = getComputedStyle(e); return (s.backdropFilter && s.backdropFilter !== "none") || (s.webkitBackdropFilter && s.webkitBackdropFilter !== "none"); }).length,
    // The liquid glass draws its backdrop on a ::before (cards, rows, panels) or ::after (buttons) layer, so count those too, and how many
    // of them are on screen (the ones the browser actually composites while scrolling).
    pseudoBackdrop: (() => {
      let all = 0, onScreen = 0;
      for (const e of document.querySelectorAll("*")) {
        for (const p of ["::before", "::after"]) {
          const s = getComputedStyle(e, p);
          if (s.content !== "none" && s.backdropFilter && s.backdropFilter !== "none") {
            all++;
            const r = e.getBoundingClientRect();
            if (r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && r.width > 0) onScreen++;
          }
        }
      }
      return { all, onScreen };
    })(),
    liveLenses: document.querySelectorAll("[data-lg-ready]").length,
    svgFilters: document.querySelectorAll("filter").length,
    domNodes: document.getElementsByTagName("*").length,
  }));
  rows.push({ path, size: `${w}x${h}`, role, solid, lcpMs: Math.round(m.lcp), cls: +m.cls.toFixed(4), backdropElements: m.backdropEls, pseudoBackdrop: m.pseudoBackdrop.all, pseudoBackdropOnScreen: m.pseudoBackdrop.onScreen, liveLenses: m.liveLenses, svgFilters: m.svgFilters, domNodes: m.domNodes, at: new Date().toISOString() });
  console.log(rows.at(-1));
  await ctx.close();
}
await browser.close();
writeFileSync(out, JSON.stringify({ note: "dev server, shared machine, compare only on the same machine", rows }, null, 2));

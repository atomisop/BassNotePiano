// Prints which elements shift during load. Usage: node scripts/glass-revamp/cls-sources.mjs <role> <path> [WxH]
import { chromium } from "@playwright/test";
const [role, path, size = "390x844"] = process.argv.slice(2);
const [w, h] = size.split("x").map(Number);
const base = process.env.E2E_BASE_URL ?? "http://localhost:3101";
if (!/localhost|127\.0\.0\.1/.test(base)) process.exit(2);
const b = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const c = await b.newContext({ viewport: { width: w, height: h }, colorScheme: "dark", reducedMotion: "reduce", storageState: role === "guest" ? undefined : `.auth/${role}.json`, ...(w < 500 ? { hasTouch: true } : {}) });
const p = await c.newPage();
await p.addInitScript(() => {
  window.__shifts = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__shifts.push({ t: Math.round(e.startTime), v: +e.value.toFixed(4), src: (e.sources || []).map((s) => { const n = s.node; return n ? `${n.nodeName.toLowerCase()}${n.className && typeof n.className === "string" ? "." + n.className.split(" ").slice(0, 3).join(".") : ""} | ${Math.round(s.previousRect.y)}→${Math.round(s.currentRect.y)} h${Math.round(s.previousRect.height)}→${Math.round(s.currentRect.height)}` : "?"; }) }); }).observe({ type: "layout-shift", buffered: true });
});
await p.goto(base + path, { waitUntil: "load", timeout: 120000 });
await p.waitForTimeout(5000);
for (const s of await p.evaluate(() => window.__shifts)) console.log(JSON.stringify(s));
await b.close();

// Lists every element with a backdrop-filter on a page. Usage: node scripts/glass-revamp/backdrop-list.mjs <role> <path> [WxH]
import { chromium } from "@playwright/test";
const [role, path, size = "390x844"] = process.argv.slice(2);
const [w, h] = size.split("x").map(Number);
const base = process.env.E2E_BASE_URL ?? "http://localhost:3101";
if (!/localhost|127\.0\.0\.1/.test(base)) process.exit(2);
const b = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const c = await b.newContext({ viewport: { width: w, height: h }, colorScheme: "dark", reducedMotion: "reduce", storageState: role === "guest" ? undefined : `.auth/${role}.json`, ...(w < 500 ? { hasTouch: true } : {}) });
const p = await c.newPage();
await p.goto(base + path, { waitUntil: "domcontentloaded", timeout: 400000 });
await p.waitForLoadState("load", { timeout: 60000 }).catch(() => {});
await p.waitForTimeout(5000);
const rows = await p.evaluate(() => [...document.querySelectorAll("*")].filter((e) => { const s = getComputedStyle(e); return (s.backdropFilter && s.backdropFilter !== "none") || (s.webkitBackdropFilter && s.webkitBackdropFilter !== "none"); }).map((e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return { tag: e.tagName.toLowerCase(), cls: String(e.className).slice(0, 90), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), onScreen: r.bottom > 0 && r.top < innerHeight && r.width > 0, filter: s.backdropFilter.slice(0, 40) }; }));
for (const r of rows) console.log(JSON.stringify(r));
console.log("total", rows.length, "onScreen", rows.filter((r) => r.onScreen).length);
await b.close();

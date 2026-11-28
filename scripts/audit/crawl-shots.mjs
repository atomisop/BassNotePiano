// Crawls the LOCAL app from a start path, following links under a prefix, and screenshots every page found at several widths and
// both themes, with overflow and axe results. Used by the full UI audit (docs/UI-AUDIT-RULE.md).
// Usage: node scripts/audit/crawl-shots.mjs <session name in .auth> <start path> <prefix> <out dir> [max pages]
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [session, start, prefix, out, maxArg] = process.argv.slice(2);
const MAX = Number(maxArg ?? 70);
const base = process.env.E2E_BASE_URL ?? "http://localhost:3101";
if (!base.includes("localhost")) { console.error("local only"); process.exit(2); }
const KEEP = new Set(["section", "tab", "filter", "view", "show"]);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });

function normalize(href) {
  const u = new URL(href, base);
  if (u.origin !== new URL(base).origin || !u.pathname.startsWith(prefix)) return null;
  const q = [...u.searchParams.entries()].filter(([k]) => KEEP.has(k)).sort();
  // People's own pages: keep the shape, not every id.
  const shape = u.pathname.replace(/\/c[a-z0-9]{20,}|\/[0-9a-f-]{36}/g, "/:id");
  return { url: u.pathname + (q.length ? "?" + new URLSearchParams(q) : ""), shape: shape + JSON.stringify(q) };
}

// 1. Discover.
const found = [];
const shapes = new Map();
const queue = [start];
const seen = new Set();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: `.auth/${session}.json` });
const page = await ctx.newPage();
while (queue.length && found.length < MAX) {
  const path = queue.shift();
  if (seen.has(path)) continue;
  seen.add(path);
  const res = await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => null);
  if (!res || res.status() >= 400) { console.log("skip", path, res?.status()); continue; }
  await page.waitForTimeout(1200);
  const finalPath = new URL(page.url()).pathname + new URL(page.url()).search;
  if (!finalPath.startsWith(prefix)) continue;
  found.push(path);
  const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
  for (const h of hrefs) {
    const n = h && normalize(h);
    if (!n) continue;
    const count = shapes.get(n.shape) ?? 0;
    if (count >= 2 || seen.has(n.url)) continue;
    shapes.set(n.shape, count + 1);
    queue.push(n.url);
  }
}
await ctx.close();
console.log(`found ${found.length} pages`);

// 2. Capture.
const plan = [["dark", 1280, 900], ["dark", 768, 1024], ["dark", 390, 844], ["light", 1280, 900], ["light", 390, 844]];
const manifest = [];
for (const path of found) {
  const name = (path.replace(/^\//, "").replace(/[\/?=&]+/g, "_") || "home").slice(0, 80);
  for (const [theme, w, h] of plan) {
    const c = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, reducedMotion: "reduce", storageState: `.auth/${session}.json`, ...(w < 500 ? { hasTouch: true, isMobile: true } : {}) });
    const p = await c.newPage();
    await p.addInitScript((t) => { try { localStorage.setItem("bnp-theme", t); localStorage.setItem("bnp-add-to-home-seen", "1"); } catch {} }, theme === "light" ? "paper" : "ink");
    const t0 = Date.now();
    const res = await p.goto(base + path, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
    if (!res || res.status() >= 400) { await c.close(); continue; }
    await p.waitForTimeout(2000);
    // The app scrolls inside #app-scroll, so a full-page shot of the window would only show the first screen: grow the window to the
    // content's height instead (capped), then shoot.
    const tall = await p.evaluate(() => { const s = document.getElementById("app-scroll"); return s ? s.scrollHeight + (innerHeight - s.clientHeight) : document.documentElement.scrollHeight; });
    await p.setViewportSize({ width: w, height: Math.min(Math.max(tall, h), 7000) });
    await p.waitForTimeout(600);
    const file = join(out, `${name}--${theme}-${w}.png`);
    await p.screenshot({ path: file });
    const facts = await p.evaluate(() => {
      const main = document.querySelector("main") ?? document.body;
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const buttons = [...main.querySelectorAll("button, a[role=button], a[class*=btn], [data-slot=button]")].filter(vis);
      const orange = [...main.querySelectorAll("*")].filter((el) => vis(el) && /bg-signal|text-signal-fg|border-signal/.test(el.className?.toString?.() ?? "")).length;
      const small = [...main.querySelectorAll("button, a")].filter((el) => { const r = el.getBoundingClientRect(); return vis(el) && (r.height < 24 || r.width < 24); }).length;
      return { overflow: document.documentElement.scrollWidth > innerWidth + 1, height: document.documentElement.scrollHeight, buttons: buttons.length, orangeElements: orange, tinyTargets: small, words: (main.innerText || "").split(/\s+/).length };
    });
    let axe = null;
    if (theme === "dark" && w === 1280) {
      const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze().catch(() => null);
      axe = r?.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes[0]?.target?.join(" ") }));
    }
    manifest.push({ path, theme, width: w, file, ...facts, axe });
    console.log(Date.now() - t0, "ms", file, facts.overflow ? "OVERFLOW" : "", `btn:${facts.buttons} orange:${facts.orangeElements} tiny:${facts.tinyTargets}`);
    await c.close();
  }
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
}
await browser.close();

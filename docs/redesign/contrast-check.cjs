// Contrast check for the neumorphic redesign. Logs into the local verify
// server as the test admin, then for each page in dark and light mode finds
// every visible text element and compares its color with the nearest opaque
// background. Reports anything under 4.5:1 (3:1 for large text).
// Usage: PLAYWRIGHT_CORE=<path> node docs/redesign/contrast-check.cjs
const path = "/Users/yisehakberhanu/Desktop/Music App";
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");
const fs = require("fs");
const env = Object.fromEntries(fs.readFileSync(path + "/.env.redesign-verify.local", "utf8").split("\n").filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const BASE = "http://localhost:3100";
const PAGES = ["/dashboard", "/scales/major-scale", "/messages", "/friends", "/account", "/admin/users", "/pricing"];
(async () => {
  const exe = fs.readdirSync(process.env.HOME + "/Library/Caches/ms-playwright").find(d => d.startsWith("chromium-"));
  const browser = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/${exe}/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing` }).catch(() => chromium.launch());
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(BASE + "/login", { timeout: 180000, waitUntil: "networkidle" }); await page.waitForTimeout(1500);
  await page.fill("input[type=email]", env.VERIFY_ADMIN_EMAIL);
  await page.fill("input[type=password]", env.VERIFY_ADMIN_PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL(u => u.pathname === "/dashboard", { timeout: 120000 });
  for (const mode of ["dark", "light"]) {
    for (const p of PAGES) {
      await page.goto(BASE + p, { waitUntil: "load", timeout: 90000 }).catch(() => {});
      await page.evaluate((m) => { document.documentElement.dataset.mode = m; document.documentElement.dataset.theme = m === "dark" ? "ink" : "paper"; }, mode);
      await page.waitForTimeout(1800);
      const bad = await page.evaluate(() => {
        const parse = (c) => { const m = c.match(/[\d.]+/g); return m ? m.map(Number) : [0, 0, 0, 0]; };
        const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const bgOf = (el) => { let e = el; while (e) { const c = parse(getComputedStyle(e).backgroundColor); if ((c[3] ?? 1) > 0.95) return c; e = e.parentElement; } return [255, 255, 255]; };
        const out = []; const seen = new Set();
        document.querySelectorAll("body *").forEach((el) => {
          if (!el.childNodes.length) return;
          const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
          if (!hasText) return;
          const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return;
          const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.opacity === "0") return;
          const fg = parse(cs.color); const bg = bgOf(el);
          const a = fg[3] ?? 1; const mix = fg.slice(0, 3).map((v, i) => v * a + bg[i] * (1 - a));
          const l1 = lum(mix), l2 = lum(bg); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          const large = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && +cs.fontWeight >= 700);
          if (ratio < (large ? 3 : 4.5)) { const k = el.textContent.trim().slice(0, 30) + "|" + ratio.toFixed(1); if (!seen.has(k)) { seen.add(k); out.push(`${ratio.toFixed(2)} "${el.textContent.trim().slice(0, 30)}" <${el.tagName.toLowerCase()} ${String(el.className).slice(0, 60)}>`); } }
        });
        return out.slice(0, 12);
      });
      console.log(`[${mode}] ${p}: ${bad.length ? "\n  " + bad.join("\n  ") : "ok"}`);
    }
  }
  await browser.close();
})();

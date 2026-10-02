// Redesign width check: logs into the local verify server (port 3100, see
// .claude/launch.json "next-dev-verify") as the test admin from
// .env.redesign-verify.local, then checks every signed-in page at
// 390/768/1024/1440/1920px for sideways overflow.
// Usage: PLAYWRIGHT_CORE=<path to playwright-core> node docs/redesign/width-check.cjs <outDir> [page@width,...] <testUserId>
const path = "/Users/yisehakberhanu/Desktop/Music App";
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");
const fs = require("fs");
const env = Object.fromEntries(fs.readFileSync(path + "/.env.redesign-verify.local", "utf8").split("\n").filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const BASE = "http://localhost:3100";
const OUT = process.argv[2]; const SHOTS = (process.argv[3] || "").split(",").filter(Boolean);
const PAGES = ["/dashboard","/scales/major-scale","/lessons","/schedule","/friends","/messages","/account","/profile","/about","/billing/plans","/billing/lessons","/billing/history","/admin","/admin/payments","/admin/payment-plans","/admin/credits","/admin/students","/admin/users","/admin/users/"+process.argv[4],"/admin/progress","/admin/schedule","/admin/lessons","/admin/support","/admin/announcements","/onboarding"];
const WIDTHS = [390,768,1024,1440,1920];
(async () => {
  const exe = fs.readdirSync(process.env.HOME + "/Library/Caches/ms-playwright").find(d => d.startsWith("chromium-"));
  const browser = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/${exe}/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing` }).catch(() => chromium.launch());
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/login");
  await page.fill('input[type=email]', env.VERIFY_ADMIN_EMAIL);
  await page.fill('input[type=password]', env.VERIFY_ADMIN_PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL(/dashboard/, { timeout: 60000 });
  // pre-warm compiles
  for (const p of PAGES) { await page.goto(BASE + p, { timeout: 120000 }).catch(() => {}); }
  const rows = [];
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    for (const p of PAGES) {
      await page.goto(BASE + p, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(700);
      const r = await page.evaluate(() => {
        const w = innerWidth, m = document.querySelector("main"); let c = 0; const off = [];
        const root = m || document.body;
        root.querySelectorAll("*").forEach(e => { const r = e.getBoundingClientRect(); if (r.width > c && r.height > 40) c = r.width; if (r.right > w + 1 && r.width > 0 && off.length < 2 && getComputedStyle(e).position !== "fixed") off.push((String(e.className || e.tagName)).slice(0, 70)); });
        return { url: location.pathname, pageOver: document.documentElement.scrollWidth > w + 1, mainOver: m ? m.scrollWidth > m.clientWidth + 1 : null, content: Math.round(c), off };
      });
      rows.push({ p, w, ...r });
      if (SHOTS.includes(`${p}@${w}`)) await page.screenshot({ path: `${OUT}/${p.replace(/\//g, "_")}@${w}.png` });
    }
  }
  fs.writeFileSync(OUT + "/widths.json", JSON.stringify(rows, null, 1));
  await browser.close();
  const bad = rows.filter(r => r.pageOver || r.mainOver || r.off.length);
  console.log("checked", rows.length, "page/width combos; problems:", bad.length);
  for (const b of bad) console.log(b.w, b.p, "->", b.url, b.pageOver ? "PAGE-OVERFLOW" : "", b.mainOver ? "MAIN-OVERFLOW" : "", b.off.join(" | "));
  const tbl = {}; for (const r of rows) { (tbl[r.p] ||= {})[r.w] = r.content + (r.url !== r.p ? `(→${r.url})` : ""); }
  console.table(tbl);
})().catch(e => { console.error("FAIL", e.message); process.exit(1); });

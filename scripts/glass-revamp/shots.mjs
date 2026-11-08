// Real screenshots (and optional axe results) of the running LOCAL app, signed in or not.
// Usage: node scripts/glass-revamp/shots.mjs <TASK> <before|after|states> --role guest|student|admin --theme dark|light
//        [--browser chromium|webkit|firefox] [--sizes 1440x900,390x844,320x700] [--solid] [--axe] [--tag name] <paths...>
import { chromium, webkit, firefox } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const a = process.argv.slice(2);
const flag = (n, d) => (a.includes(n) ? a[a.indexOf(n) + 1] : d);
const [task, phase] = a;
const valued = ["--role", "--theme", "--browser", "--sizes", "--tag"];
const paths = a.slice(2).filter((x, i, arr) => x.startsWith("/") && !valued.includes(arr[i - 1]));
const role = flag("--role", "guest"), theme = flag("--theme", "dark"), bname = flag("--browser", "chromium");
const sizes = flag("--sizes", "1440x900,390x844,320x700").split(",").map((s) => s.split("x").map(Number));
const solid = a.includes("--solid"), axe = a.includes("--axe"), tag = flag("--tag", "");
const base = process.env.E2E_BASE_URL ?? "http://localhost:3101";
if (!base.includes("localhost")) { console.error("local only"); process.exit(2); }
if (!task || !paths.length) { console.error("usage: see header"); process.exit(2); }
const out = join("docs/glass-revamp/evidence", task, phase);
mkdirSync(out, { recursive: true });
const sha = execSync("git rev-parse --short HEAD").toString().trim();
const manifestFile = join("docs/glass-revamp/evidence", task, `manifest-${phase}-${role}-${theme}-${bname}${solid ? "-solid" : ""}${tag ? "-" + tag : ""}.json`);
const manifest = { task, shots: [] };
const browser = await { chromium, webkit, firefox }[bname].launch();
let bad = false;
for (const path of paths) {
  for (const [w, h] of sizes) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: h }, colorScheme: theme, reducedMotion: "reduce",
      storageState: role === "guest" ? undefined : `.auth/${role}.json`,
      ...(w < 500 ? { hasTouch: true } : {}),
    });
    const page = await ctx.newPage();
    let res = null;
    for (let attempt = 1; attempt <= 3 && !res; attempt++) {
      res = await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 150000 }).catch((e) => { console.error(`${path} attempt ${attempt}: ${e.message.split("\n")[0]}`); return null; });
    }
    // Never save a picture of a page that did not load: that would be fake evidence.
    if (!res || res.status() >= 400) { console.error(`SKIPPED ${path} ${w}x${h}: HTTP ${res?.status()}`); bad = true; await ctx.close(); continue; }
    await page.waitForLoadState("load", { timeout: 60000 }).catch(() => {});
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    if (solid) await page.evaluate(() => document.documentElement.setAttribute("data-solid-surfaces", "on"));
    await page.waitForTimeout(3500);
    const name = (path === "/" ? "home" : path.replace(/^\//, "").replace(/[\/?=&\[\]]+/g, "_")) + (tag ? `-${tag}` : "");
    const file = join(out, `${name}-${role}-${theme}${solid ? "-solid" : ""}-${bname}-${w}x${h}.png`);
    await page.screenshot({ path: file });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    let violations = null;
    if (axe && w === sizes[0][0]) {
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
      violations = r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
    }
    manifest.shots.push({ file, path, role, theme, browser: bname, size: `${w}x${h}`, solid, sha, at: new Date().toISOString(), finalUrl: page.url(), status: res?.status(), horizontalOverflow: overflow, axe: violations });
    console.log("saved", file, overflow ? "OVERFLOW" : "", violations ? `axe:${violations.length}` : "");
    writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
    await ctx.close();
  }
}
await browser.close();
manifest.sha = sha;
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
process.exit(bad ? 1 : 0);

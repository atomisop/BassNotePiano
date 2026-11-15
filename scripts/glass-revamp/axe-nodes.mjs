// Lists the failing nodes for serious/critical axe rules on one page. Usage: node scripts/glass-revamp/axe-nodes.mjs <role> <theme> <path> [WxH]
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const [role, theme, path, size = "1440x900"] = process.argv.slice(2);
const [w, h] = size.split("x").map(Number);
const base = process.env.E2E_BASE_URL ?? "http://localhost:3101";
if (!/localhost|127\.0\.0\.1/.test(base)) process.exit(2);
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: w, height: h }, colorScheme: theme, reducedMotion: "reduce", storageState: role === "guest" ? undefined : `.auth/${role}.json` });
const p = await c.newPage();
await p.goto(base + path, { waitUntil: "domcontentloaded", timeout: 400000 });
await p.waitForLoadState("load", { timeout: 60000 }).catch(() => {});
await p.waitForTimeout(4000);
const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
for (const v of r.violations.filter((v) => ["serious", "critical"].includes(v.impact)))
  for (const n of v.nodes) console.log(v.id, "|", n.target.join(" "), "|", (n.any[0]?.message || n.failureSummary || "").split("\n")[0].slice(0, 160));
await b.close();

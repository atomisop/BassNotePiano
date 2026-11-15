// Opens each floating surface (profile menu, notifications, Atom, shortcut sheet) in glass and Solid and saves a picture.
// Usage: node scripts/glass-revamp/overlay-states.mjs <outdir>. Student session, dark theme, local only.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
const out = process.argv[2]; mkdirSync(out, { recursive: true });
const base = process.env.E2E_BASE_URL ?? "http://localhost:3101";
if (!/localhost|127\.0\.0\.1/.test(base)) process.exit(2);
const b = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const SURFACES = {
  "profile-menu": async (p) => { await p.getByRole("button", { name: /account|profile|menu/i }).first().click().catch(async () => p.locator("button:has-text('R')").last().click()); },
  notifications: async (p) => { await p.getByRole("button", { name: /notification/i }).first().click(); },
  atom: async (p) => { await p.getByRole("button", { name: /ask ai/i }).last().click(); },
  shortcuts: async (p) => { await p.keyboard.press("Shift+/"); },
};
for (const solid of [false, true]) for (const [w, h] of [[1440, 900], [390, 844]]) for (const [name, open] of Object.entries(SURFACES)) {
  const c = await b.newContext({ viewport: { width: w, height: h }, colorScheme: "dark", reducedMotion: "reduce", storageState: ".auth/student.json", ...(w < 500 ? { hasTouch: true } : {}) });
  const p = await c.newPage();
  await p.addInitScript((s) => { try { localStorage.setItem("bnp-theme", "ink"); if (s) localStorage.setItem("bnp-solid-surfaces", "on"); } catch {} }, solid);
  try {
    await p.goto(base + "/dashboard", { waitUntil: "domcontentloaded", timeout: 400000 });
    await p.waitForLoadState("load", { timeout: 60000 }).catch(() => {});
    await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await p.waitForTimeout(3000);
    await open(p);
    await p.waitForTimeout(1500);
    const file = join(out, `${name}-${solid ? "solid" : "glass"}-${w}x${h}.png`);
    await p.screenshot({ path: file });
    console.log("saved", file);
  } catch (e) { console.error("SKIPPED", name, solid, w, e.message.split("\n")[0]); }
  await c.close();
}
await b.close();

import { chromium } from "@playwright/test";
const b = await chromium.launch();
for (const solid of [false, true]) {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark", reducedMotion: "reduce", storageState: ".auth/student.json" });
  const p = await c.newPage();
  await p.addInitScript((s) => { try { localStorage.setItem("bnp-theme", "ink"); if (s) localStorage.setItem("bnp-solid-surfaces", "on"); } catch {} }, solid);
  await p.goto("" + (process.env.E2E_BASE_URL ?? "http://localhost:3101") + "/dashboard", { waitUntil: "domcontentloaded", timeout: 400000 });
  await p.waitForLoadState("load", { timeout: 60000 }).catch(() => {});
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await p.waitForTimeout(3000);
  await p.keyboard.press("Control+k");
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `docs/glass-revamp/evidence/GL-01-01/states/command-menu-${solid ? "solid" : "glass"}-1440x900.png` });
  await c.close();
}
await b.close();

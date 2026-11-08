// Screenshots of the piano lesson in its real states, from a running production server. Needs E2E_BASE_URL and a throwaway DB.
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const base = process.env.E2E_BASE_URL ?? "http://localhost:3307";
const db = process.env.E2E_DATABASE_URL ?? "postgresql://yisehakberhanu@127.0.0.1:5433/bnp_rework_verify?schema=public";
const out = "docs/rework/evidence/P1-MUS-02/states";
mkdirSync(out, { recursive: true });
const cookie = execFileSync("node", ["--env-file=.env", "scripts/rework/test-session.mjs", "evidence.piano@example.test", "--onboarded"], { env: { ...process.env, DATABASE_URL: db }, encoding: "utf8" }).trim();
const key = (p, n) => p.getByRole("group", { name: "Piano keyboard" }).getByRole("button", { name: n, exact: true });
const browser = await chromium.launch();
for (const [w, h] of [[1440, 900], [390, 844], [320, 700]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: "dark" });
  await ctx.addCookies([{ name: "next-auth.session-token", value: cookie, url: base }]);
  const p = await ctx.newPage();
  const shot = (name) => p.screenshot({ path: `${out}/${name}-dark-${w}x${h}.png` });
  await p.goto(`${base}/practice/piano`, { waitUntil: "domcontentloaded" });
  await p.getByRole("heading", { name: "Piano practice" }).waitFor();
  await p.waitForTimeout(1200);
  await shot("guided-start");
  await key(p, "E4").click(); // wrong on purpose
  await p.waitForTimeout(400);
  await shot("guided-wrong-note");
  for (const n of ["C4", "D4", "E4", "G4", "A4", "C5"]) { await key(p, n).click(); await p.waitForTimeout(120); }
  await p.getByRole("region", { name: "Your result" }).waitFor();
  await p.waitForTimeout(400);
  await shot("guided-finished");
  await p.getByRole("button", { name: "From memory", exact: true }).click();
  await p.waitForTimeout(500);
  await shot("memory-mode");
  await ctx.close();
}
await browser.close();
console.log("saved to", out);

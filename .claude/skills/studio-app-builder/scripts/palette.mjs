#!/usr/bin/env node
// One colour in, a whole light + dark token set out, every text pair checked against WCAG 2.
//
//   node palette.mjs "#E8641E"                 -> prints themes.css to stdout, report to stderr
//   node palette.mjs "#2D6CDF" --out src/app/themes.css --json palette.json
//   node palette.mjs teal --dark-ground black  -> pitch-black dark theme (BNP's current look)
//
// Named colours: any CSS hex, or one of the names in NAMED below.
// Contract (the same one Bass Note Piano's components read; see references/design-system.md):
//   --c-s-50 .. --c-s-950   ground<->text ramp, LOW = strongest text, HIGH = page ground, in BOTH themes
//   --c-a-100 .. --c-a-500  accent ramp (300 = the accent itself)
//   --signal / --signal-fg / --signal-ink   accent fill, accent AS TEXT, label ON the fill
//   --c-em-* --c-ye-* --c-rd-*   success / warning / danger
//   --c-ground / --c-card / --c-lift / --c-hairline / --c-ink / --c-scrim
// Channels are space separated RGB so Tailwind's /opacity modifiers work.
// No dependencies. Node 18+.

import { writeFileSync } from "node:fs";

const NAMED = {
  orange: "#E8641E", red: "#D62C3E", crimson: "#BE223A", coral: "#F26B5B", amber: "#F2A007", yellow: "#F5C518",
  lime: "#84CC16", green: "#22A55A", emerald: "#10B981", teal: "#0EA5A4", cyan: "#06B6D4", sky: "#0EA5E9",
  blue: "#2D6CDF", indigo: "#5B5BD6", violet: "#7C3AED", purple: "#9333EA", magenta: "#C026D3", pink: "#E64980",
  rose: "#E11D48", brown: "#8B5A2B", gold: "#C9A227", black: "#111111", white: "#F5F5F5", gray: "#6B7280",
};

// ---------- colour maths (sRGB <-> OKLab / OKLCH) ----------
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToRgb(hex) {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`Not a colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}
const rgbToHex = (rgb) => "#" + rgb.map((c) => Math.round(clamp01(c) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
const channels = (rgb) => rgb.map((c) => Math.round(clamp01(c) * 255)).join(" ");

function rgbToOklch([r, g, b]) {
  const [lr, lg, lb] = [toLin(r), toLin(g), toLin(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}
function oklchToRgbRaw(L, C, H) {
  const a = C * Math.cos((H * Math.PI) / 180), b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(toGam);
}
// Keep lightness and hue, lower chroma until it fits sRGB.
function oklch(L, C, H) {
  let c = C;
  for (let i = 0; i < 40; i++) {
    const rgb = oklchToRgbRaw(L, c, H);
    if (rgb.every((v) => v >= -0.0005 && v <= 1.0005)) return rgb.map(clamp01);
    c *= 0.92;
  }
  return oklchToRgbRaw(L, 0, H).map(clamp01);
}

const lum = (rgb) => { const [r, g, b] = rgb.map(toLin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// Find the lightness (on the far side of `ground`) whose contrast against `ground` is `target`.
function solveL(target, ground, C, H, towardDark) {
  let lo = towardDark ? 0 : rgbToOklch(ground)[0], hi = towardDark ? rgbToOklch(ground)[0] : 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2, cr = contrast(oklch(mid, C, H), ground);
    // moving away from the ground raises contrast
    if (towardDark ? cr > target : cr < target) lo = mid; else hi = mid;
  }
  return oklch((lo + hi) / 2, C, H);
}

// ---------- inputs ----------
const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const input = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!input) {
  console.error('Usage: node palette.mjs "<hex or colour name>" [--out themes.css] [--json report.json] [--dark-ground black|tinted] [--default dark|light]');
  process.exit(1);
}
const accentHex = NAMED[input.toLowerCase()] ?? input;
const accent = hexToRgb(accentHex);
const [aL, aC, aH] = rgbToOklch(accent);
const darkGround = flag("--dark-ground", "tinted");
const defaultMode = flag("--default", "dark");

// A near-grey accent (black, white, gray) gets neutral greys; otherwise neutrals lean slightly toward the accent's hue.
const isNeutralAccent = aC < 0.03;
const nH = aH, nCdark = isNeutralAccent ? 0 : 0.012, nClight = isNeutralAccent ? 0 : 0.008;

// ---------- semantic hues, kept apart from the accent ----------
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const notes = [];
let dangerH = 25, successH = 150, warnH = 80;
if (!isNeutralAccent && hueGap(aH, dangerH) < 30) { dangerH = aH < 25 || aH > 300 ? 50 : 355; notes.push(`Accent is close to red: danger moved to hue ${dangerH} (${dangerH > 300 ? "crimson" : "vermilion"}) so a problem never reads as "tap this". Always pair danger with a word.`); }
if (!isNeutralAccent && hueGap(aH, successH) < 30) { successH = aH < 150 ? 175 : 125; notes.push(`Accent is close to green: success moved to hue ${successH}. Always pair success with a word or a check icon.`); }
if (!isNeutralAccent && hueGap(aH, warnH) < 25) { warnH = aH < 80 ? 100 : 60; notes.push(`Accent is close to yellow/amber: warning moved to hue ${warnH}.`); }

// ---------- build one theme ----------
// Text steps by target contrast against the page ground. 700..950 are surfaces and lines, not text.
const TEXT_TARGETS = { 50: 15.5, 100: 13.5, 200: 11.5, 300: 9.5, 400: 7.5, 500: 6.0, 600: 4.8 };
function buildTheme(mode) {
  const dark = mode === "dark";
  const C = dark ? nCdark : nClight;
  const ground = dark ? (darkGround === "black" ? [0, 0, 0] : oklch(0.17, C * 1.2, nH)) : oklch(0.965, C, nH);
  const card = dark ? (darkGround === "black" ? oklch(0.19, C * 1.4, nH) : oklch(0.215, C * 1.2, nH)) : oklch(0.995, C * 0.5, nH);
  const lift = dark ? oklch(rgbToOklch(card)[0] + 0.05, C * 1.2, nH) : oklch(1, 0, nH);
  const hairline = dark ? oklch(rgbToOklch(card)[0] + 0.09, C, nH) : oklch(0.89, C, nH);

  // Text must read on BOTH the page and a card, so solve against whichever is closer to the text: the card in dark
  // (it is lighter than the page), the page in light (it is darker than the card).
  const textSurface = dark ? card : ground;
  const ramp = {};
  for (const [step, t] of Object.entries(TEXT_TARGETS)) ramp[step] = solveL(t, textSurface, C, nH, !dark);
  ramp[700] = solveL(3.15, textSurface, C, nH, !dark); // icons, focus rings, edges (3:1)
  ramp[800] = hairline;
  ramp[900] = card;
  ramp[950] = ground;

  // Accent ramp (300 = the colour asked for, exactly).
  const a = {
    100: oklch(Math.min(0.97, aL + 0.25), aC * 0.35, aH),
    200: oklch(Math.min(0.92, aL + 0.12), aC * 0.7, aH),
    300: accent,
    400: oklch(Math.max(0.2, aL - 0.08), aC, aH),
    500: oklch(Math.max(0.15, aL - 0.16), aC, aH),
  };

  // Accent AS TEXT: same hue, moved until it reads at 4.5:1 on both the ground and the card.
  const fgTarget = 4.6;
  let signalFg = accent;
  if (Math.min(contrast(accent, ground), contrast(accent, card)) < fgTarget) signalFg = solveL(fgTarget, textSurface, aC, aH, !dark);
  // Label ON the accent fill: dark ink or white, whichever reads better.
  const inkDark = oklch(0.18, nCdark * 1.5, nH), inkLight = [1, 1, 1];
  const signalInk = contrast(inkDark, accent) >= contrast(inkLight, accent) ? inkDark : inkLight;

  const sem = (H, C2) => ({
    300: solveL(dark ? 8 : 6.5, ground, C2, H, !dark),
    400: solveL(dark ? 6 : 5.2, ground, C2, H, !dark),
    500: solveL(4.7, [1, 1, 1], C2, H, true), // a fill that carries a white label
  });
  const em = sem(successH, 0.15), ye = sem(warnH, 0.15), rd = sem(dangerH, 0.19);

  return { ground, card, lift, hairline, ramp, a, signalFg, signalInk, em, ye, rd, ink: dark ? [1, 1, 1] : ramp[50] };
}

const light = buildTheme("light"), dark = buildTheme("dark");

// ---------- report ----------
const checks = [];
function check(theme, name, fg, bgName, bg, min) {
  const cr = contrast(fg, bg);
  checks.push({ theme, pair: `${name} on ${bgName}`, ratio: +cr.toFixed(2), min, pass: cr >= min });
}
for (const [name, t] of [["light", light], ["dark", dark]]) {
  for (const s of [50, 300, 400, 500, 600]) { check(name, `slate-${s} text`, t.ramp[s], "ground", t.ground, 4.5); check(name, `slate-${s} text`, t.ramp[s], "card", t.card, 4.5); }
  check(name, "slate-700 edge", t.ramp[700], "ground", t.ground, 3);
  check(name, "signal-fg text", t.signalFg, "ground", t.ground, 4.5);
  check(name, "signal-fg text", t.signalFg, "card", t.card, 4.5);
  check(name, "signal-ink label", t.signalInk, "accent fill", accent, 4.5);
  check(name, "accent fill edge", accent, "ground", t.ground, 3);
  check(name, "success text", t.em[400], "card", t.card, 4.5);
  check(name, "warning text", t.ye[400], "card", t.card, 4.5);
  check(name, "danger text", t.rd[400], "card", t.card, 4.5);
  check(name, "white on danger fill", [1, 1, 1], "red-500", t.rd[500], 4.5);
}
const labelFails = checks.filter((c) => !c.pass && c.pair.startsWith("signal-ink"));
if (labelFails.length) notes.push(`No label colour reaches 4.5:1 on ${accentHex}. Use it for icons, rings and large text only, and make primary buttons with --c-a-500 (${rgbToHex(light.a[500])}) as the fill, or pick a darker or lighter shade.`);
for (const f of checks.filter((c) => !c.pass && c.pair.startsWith("accent fill edge"))) notes.push(`The accent fill is only ${f.ratio}:1 against the ${f.theme} page: a filled button there must be recognisable by its label, not its edge (fine, BNP has the same case).`);

// ---------- CSS ----------
function block(selector, t, comment) {
  const L = [];
  L.push(`/* ${comment} */`, `${selector} {`);
  for (const s of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) L.push(`  --c-s-${s}: ${channels(t.ramp[s])}; /* ${rgbToHex(t.ramp[s])}${TEXT_TARGETS[s] ? ` ${contrast(t.ramp[s], t.ground).toFixed(1)}:1` : ""} */`);
  for (const s of [100, 200, 300, 400, 500]) L.push(`  --c-a-${s}: ${channels(t.a[s])}; /* ${rgbToHex(t.a[s])} */`);
  L.push(`  --signal: ${channels(accent)}; /* ${accentHex.toUpperCase()} the one accent */`);
  L.push(`  --signal-fg: ${channels(t.signalFg)}; /* ${rgbToHex(t.signalFg)} accent as text */`);
  L.push(`  --signal-ink: ${channels(t.signalInk)}; /* ${rgbToHex(t.signalInk)} label on the accent fill */`);
  for (const [k, v] of [["em", t.em], ["ye", t.ye], ["rd", t.rd]]) for (const s of [300, 400, 500]) L.push(`  --c-${k}-${s}: ${channels(v[s])}; /* ${rgbToHex(v[s])} */`);
  L.push(`  --c-ground: ${channels(t.ground)};`, `  --c-card: ${channels(t.card)};`, `  --c-lift: ${channels(t.lift)};`, `  --c-hairline: ${channels(t.hairline)};`);
  L.push(`  --c-ink: ${channels(t.ink)};`, `  --c-scrim: 0 0 0;`, "}");
  return L.join("\n");
}
const d = defaultMode === "light" ? light : dark;
const css = [
  `/* Generated by studio-app-builder/scripts/palette.mjs from ${accentHex.toUpperCase()}. Re-run the script instead of editing by hand.`,
  `   Default theme: ${defaultMode}. Dark ground: ${darkGround}. */`,
  "",
  block(`:root,\n[data-theme="${defaultMode}"]`, d, `${defaultMode} (default)`),
  "",
  block(`[data-theme="${defaultMode === "light" ? "dark" : "light"}"]`, defaultMode === "light" ? dark : light, defaultMode === "light" ? "dark" : "light"),
  "",
  `@media (prefers-color-scheme: ${defaultMode === "light" ? "dark" : "light"}) {`,
  block(`  :root:not([data-theme])`, defaultMode === "light" ? dark : light, "follow the device until the person picks").split("\n").map((l) => "  " + l).join("\n"),
  "}",
  "",
].join("\n");

const out = flag("--out");
if (out) writeFileSync(out, css); else process.stdout.write(css);
const json = flag("--json");
const report = { accent: accentHex.toUpperCase(), oklch: { L: +aL.toFixed(3), C: +aC.toFixed(3), H: +aH.toFixed(1) }, notes, failures: checks.filter((c) => !c.pass), checks };
if (json) writeFileSync(json, JSON.stringify(report, null, 2));

const fails = checks.filter((c) => !c.pass && !c.pair.startsWith("accent fill edge"));
console.error(`\nAccent ${accentHex.toUpperCase()}  (OKLCH L ${aL.toFixed(2)} C ${aC.toFixed(2)} H ${aH.toFixed(0)})`);
console.error(`light: ground ${rgbToHex(light.ground)} card ${rgbToHex(light.card)} text ${rgbToHex(light.ramp[50])} accent-text ${rgbToHex(light.signalFg)} label ${rgbToHex(light.signalInk)}`);
console.error(`dark:  ground ${rgbToHex(dark.ground)} card ${rgbToHex(dark.card)} text ${rgbToHex(dark.ramp[50])} accent-text ${rgbToHex(dark.signalFg)} label ${rgbToHex(dark.signalInk)}`);
console.error(`${checks.length - fails.length}/${checks.length} contrast checks pass (accent-edge notes excluded).`);
for (const f of fails) console.error(`  FAIL ${f.theme}: ${f.pair} ${f.ratio}:1 (needs ${f.min})`);
for (const n of notes) console.error(`  note: ${n}`);
process.exitCode = fails.length ? 2 : 0;

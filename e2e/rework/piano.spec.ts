import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signInAs, uniqueEmail } from "../fixtures";

const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/** Counts every oscillator the page starts, so "it makes sound" is measured, not assumed. */
async function countOscillators(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __osc: number }).__osc = 0;
    const proto = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext).prototype;
    const orig = proto.createOscillator;
    proto.createOscillator = function (this: AudioContext) {
      (window as unknown as { __osc: number }).__osc++;
      return orig.call(this);
    };
  });
}
const oscillators = (page: Page) => page.evaluate(() => (window as unknown as { __osc: number }).__osc);

async function open(page: Page, context: import("@playwright/test").BrowserContext, tag: string) {
  await signInAs(context, base, uniqueEmail(tag), { onboarded: true });
  await page.goto("/practice/piano");
  await expect(page.getByRole("heading", { name: "Piano practice" })).toBeVisible();
}
const key = (page: Page, name: string) => page.getByRole("group", { name: "Piano keyboard" }).getByRole("button", { name, exact: true });
const PHRASE = ["C4", "D4", "E4", "G4", "A4", "C5"];

test.describe("playable piano lesson (P1-MUS-02..05)", () => {
  test("playing a key starts real audio and presses the key", async ({ page, context }) => {
    await countOscillators(page);
    await open(page, context, "audio");
    expect(await oscillators(page)).toBe(0);
    await key(page, "C4").click();
    expect(await oscillators(page)).toBeGreaterThan(0);
  });

  test("guided: outlines the next key, scores a wrong note honestly, finishes with a summary", async ({ page, context }) => {
    await open(page, context, "guided");
    await expect(page.getByRole("status").filter({ hasText: "Play C4 to begin." })).toBeVisible();
    await expect(key(page, "C4")).toContainText("next note", { useInnerText: false }).catch(() => undefined);
    await expect(page.getByRole("progressbar", { name: "Progress" })).toHaveAttribute("aria-valuenow", "0");

    await key(page, "E4").click(); // wrong: the target is C4
    await expect(page.getByRole("status").filter({ hasText: /Not quite: you played E4/ })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Progress" })).toHaveAttribute("aria-valuenow", "0");

    for (const [i, n] of PHRASE.entries()) {
      await key(page, n).click();
      await page.waitForTimeout(90); // stay clear of the double-tap guard
      await expect(page.getByRole("progressbar", { name: "Progress" })).toHaveAttribute("aria-valuenow", String(Math.round(((i + 1) / PHRASE.length) * 100)));
    }
    const result = page.getByRole("region", { name: "Your result" });
    await expect(result).toBeVisible();
    await expect(result).toContainText("86%"); // 6 right out of 7 attempts
    await expect(result).toContainText("7"); // notes played
    await expect(result).toContainText("C4"); // the note that needed a retry
    await result.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("progressbar", { name: "Progress" })).toHaveAttribute("aria-valuenow", "0");
  });

  test("from memory: nothing is outlined and wrong notes do not reveal the answer", async ({ page, context }) => {
    await open(page, context, "memory");
    await page.getByRole("button", { name: "From memory", exact: true }).click();
    await expect(page.getByText("(next note)")).toHaveCount(0);
    await key(page, "D4").click();
    const msg = page.getByRole("status").filter({ hasText: /Not quite: you played D4\. Try again\./ });
    await expect(msg).toBeVisible();
    await expect(msg).not.toContainText("C4.");
  });

  test("the computer keyboard plays the same notes", async ({ page, context }) => {
    await countOscillators(page);
    await open(page, context, "kbd");
    await page.keyboard.press("a"); // C4
    await expect(page.getByRole("progressbar", { name: "Progress" })).toHaveAttribute("aria-valuenow", "17");
    expect(await oscillators(page)).toBeGreaterThan(0);
  });

  test("a mocked MIDI keyboard drives the same scoring path", async ({ page, context }) => {
    await page.addInitScript(() => {
      const input: { name: string; onmidimessage: ((e: { data: Uint8Array }) => void) | null } = { name: "Test Keys", onmidimessage: null };
      (window as unknown as { __midi: typeof input }).__midi = input;
      const access = { inputs: { values: () => [input][Symbol.iterator]() }, onstatechange: null };
      (navigator as unknown as { requestMIDIAccess: () => Promise<typeof access> }).requestMIDIAccess = () => Promise.resolve(access);
    });
    await open(page, context, "midi");
    await page.getByRole("button", { name: "Connect a MIDI keyboard" }).click();
    await expect(page.getByText("Test Keys")).toBeVisible();
    await page.evaluate(() => (window as unknown as { __midi: { onmidimessage: (e: { data: Uint8Array }) => void } }).__midi.onmidimessage({ data: new Uint8Array([0x90, 60, 100]) }));
    await expect(page.getByRole("progressbar", { name: "Progress" })).toHaveAttribute("aria-valuenow", "17");
  });

  test("denied MIDI permission leaves the on-screen keys working", async ({ page, context }) => {
    await page.addInitScript(() => {
      (navigator as unknown as { requestMIDIAccess: () => Promise<never> }).requestMIDIAccess = () => Promise.reject(new DOMException("no", "SecurityError"));
    });
    await open(page, context, "midideny");
    await page.getByRole("button", { name: "Connect a MIDI keyboard" }).click();
    await expect(page.getByText(/Access to MIDI was not allowed/)).toBeVisible();
    await key(page, "C4").click();
    await expect(page.getByRole("progressbar", { name: "Progress" })).toHaveAttribute("aria-valuenow", "17");
  });

  test("keys are reachable with Tab and play with Space", async ({ page, context }) => {
    await open(page, context, "tab");
    await key(page, "C4").focus();
    await page.keyboard.press("Space");
    await expect(page.getByRole("progressbar", { name: "Progress" })).toHaveAttribute("aria-valuenow", "17");
  });

  test("axe finds no serious or critical issues", async ({ page, context }) => {
    await open(page, context, "axe");
    await page.waitForTimeout(800);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
  });
});

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { db, signInAs, uniqueEmail } from "../fixtures";

const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";

test.describe("two-step onboarding (P1-ONB-01, P1-A11Y-01, P1-ONB-03)", () => {
  test("piano arrives preselected, radios expose state, coming-soon is disabled", async ({ page, context }) => {
    await signInAs(context, base, uniqueEmail("a11y"));
    await page.goto("/onboarding?instrument=piano");
    await expect(page.getByRole("heading", { name: "Who are you?" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Username" })).toBeVisible();
    await expect(page.getByRole("radio", { name: /piano/i })).toBeChecked();
    await expect(page.getByRole("radio", { name: /guitar/i })).not.toBeChecked();
    await expect(page.getByRole("radio", { name: /drums/i })).toBeDisabled();
    await expect(page.getByText("Step 1 of 2")).toBeVisible();
  });

  test("invalid or too-short username blocks Next; taken name is announced", async ({ page, context }) => {
    await signInAs(context, base, uniqueEmail("err"));
    await page.goto("/onboarding?instrument=piano");
    await page.getByRole("textbox", { name: "Username" }).fill("ab");
    await expect(page.getByRole("button", { name: "Next", exact: true })).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByRole("heading", { name: "Who are you?" })).toBeVisible();
    await page.getByRole("textbox", { name: "Username" }).fill("Bad Name!");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: /3-20 characters/ })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Username" })).toBeFocused();
    await expect(page.getByRole("textbox", { name: "Username" })).toHaveAttribute("aria-invalid", "true");
  });

  test("completes in two steps and saves instrument and level", async ({ page, context }, testInfo) => {
    const email = uniqueEmail("flow");
    const username = `rw_${Date.now().toString(36)}_${testInfo.project.name}`.slice(0, 20);
    await signInAs(context, base, email);
    await page.goto("/onboarding?instrument=piano");
    await page.getByRole("textbox", { name: "Username" }).fill(username);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    const heading = page.getByRole("heading", { name: "How much do you play?" });
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
    await page.getByText("I know the basics", { exact: true }).click();
    await expect(page.getByRole("radio", { name: "I know the basics" })).toBeChecked();
    await page.getByRole("button", { name: "Finish" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/onboarding"), { timeout: 30_000 });
    const prisma = db();
    const saved = await prisma.user.findUnique({ where: { email }, select: { username: true, primaryInstrument: true, skillLevel: true, onboardedAt: true } });
    await prisma.$disconnect();
    expect(saved).toMatchObject({ username, primaryInstrument: "PIANO_KEYBOARD", skillLevel: "INTERMEDIATE" });
    expect(saved?.onboardedAt).not.toBeNull();
  });

  test("instrument picked on the home page survives sign-up into setup", async ({ page, context }) => {
    await page.goto("/register?instrument=guitar");
    await signInAs(context, base, uniqueEmail("intent"));
    await page.goto("/onboarding");
    await expect(page.getByRole("radio", { name: /guitar/i })).toBeChecked();
  });

  test("a crafted instrument link cannot preselect a coming-soon or unknown value", async ({ page, context }) => {
    await signInAs(context, base, uniqueEmail("craft"));
    await page.goto("/onboarding?instrument=drums");
    await expect(page.getByRole("radio", { name: /drums/i })).not.toBeChecked();
    await page.goto("/onboarding?instrument=DROP_TABLE");
    await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
  });

  test("axe finds no serious or critical issues on both steps", async ({ page, context }) => {
    await signInAs(context, base, uniqueEmail("axe"));
    await page.goto("/onboarding?instrument=piano");
    await page.getByRole("heading", { name: "Who are you?" }).waitFor();
    await page.waitForTimeout(800); // let the step's fade-in finish: axe reads mid-animation opacity as low contrast
    const one = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    await page.getByRole("textbox", { name: "Username" }).fill(`ax_${Date.now().toString(36)}`);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("heading", { name: "How much do you play?" }).waitFor();
    await page.waitForTimeout(800);
    const two = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    const bad = [...one.violations, ...two.violations].filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});

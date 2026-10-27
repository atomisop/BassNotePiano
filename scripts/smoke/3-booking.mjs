import { assert, makeSuite } from "./harness.mjs";

const suite = makeSuite("3. Classes and schedule");

suite.step("the student's Online Lessons page loads with class times", async (ctx) => {
  const page = await ctx.pageFor("student");
  await page.goto(`${ctx.base}/lessons`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  const text = await page.locator("body").innerText();
  assert(!/The app failed to start/.test(text), "the app error screen showed");
  assert(/\d{1,2}:\d{2}\s?(AM|PM)/i.test(text), "no class times on the page");
});
suite.step("the plan screen opens with the plan options", async (ctx) => {
  const page = await ctx.pageFor("student");
  await page.goto(`${ctx.base}/billing/plans`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  const text = await page.locator("body").innerText();
  assert(/Plan length/i.test(text) && /1 Month/.test(text), "the plan length choices are missing");
});
suite.step("the admin weekly times list shows the seeded windows", async (ctx) => {
  const page = await ctx.pageFor("admin");
  await page.goto(`${ctx.base}/admin/schedule`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  const text = await page.locator("body").innerText();
  assert(/Staging Tuesday/.test(text), "the seeded Tuesday window is missing");
});
suite.step("the admin Reserved tab renders its form", async (ctx) => {
  const page = await ctx.pageFor("admin");
  await page.goto(`${ctx.base}/admin/schedule?view=RESERVED`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  assert(await page.getByText("Keep a day for a customer").first().isVisible(), "the reserve form is missing");
});
suite.step("the admin attendance list and today screen load", async (ctx) => {
  const page = await ctx.pageFor("admin");
  for (const path of ["/admin/schedule?view=ATTENDANCE", "/admin/today"]) {
    await page.goto(`${ctx.base}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    assert(!(await page.getByText("The app failed to start").count()), `${path} showed the error screen`);
  }
});

export default suite;

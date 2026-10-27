import { assert, makeSuite } from "./harness.mjs";

const suite = makeSuite("2. Sign in and roles");

suite.step("a wrong password is refused with a message", async (ctx) => {
  const page = await ctx.newPage();
  await page.goto(`${ctx.base}/login`);
  await page.waitForTimeout(3000);
  await page.fill('input[type="email"]', ctx.users.student.email);
  await page.fill('input[type="password"]', "definitely-wrong-password!");
  await page.click('form button[type="submit"]');
  await page.waitForTimeout(4000);
  assert(/\/login/.test(page.url()), "a wrong password still signed in");
  await page.close();
});
for (const key of ["student", "admin", "parent", "child"]) {
  suite.step(`${key} can sign in and reach the app`, async (ctx) => {
    await ctx.signIn(key);
    const page = await ctx.pageFor(key);
    await page.goto(`${ctx.base}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    assert(/\/dashboard/.test(page.url()), `landed on ${page.url()}`);
    assert(!(await page.getByText("The app failed to start").count()), "the app error screen showed");
  });
}
suite.step("the admin console opens for the admin", async (ctx) => {
  const page = await ctx.pageFor("admin");
  await page.goto(`${ctx.base}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  assert(/\/admin/.test(page.url()), `landed on ${page.url()}`);
  assert(await page.getByRole("heading", { name: "Overview" }).first().isVisible(), "no Overview heading");
});
suite.step("a student cannot open the admin console", async (ctx) => {
  const page = await ctx.pageFor("student");
  await page.goto(`${ctx.base}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  assert(!/\/admin/.test(page.url()), `a student reached ${page.url()}`);
});

export default suite;

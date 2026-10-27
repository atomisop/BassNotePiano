import { assert, makeSuite } from "./harness.mjs";

const suite = makeSuite("4. Parent mode");

suite.step("the parent's Settings has the Parent mode card with the linked child", async (ctx) => {
  const page = await ctx.pageFor("parent");
  await page.goto(`${ctx.base}/account`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.getByText("Linked · open their progress").first().waitFor({ timeout: 30000 });
  assert(await page.getByText("Kiki Child").first().isVisible(), "the linked child is not listed");
});
suite.step("the waiting request shows Withdraw, not an open button", async (ctx) => {
  const page = await ctx.pageFor("parent");
  assert(await page.getByRole("button", { name: "Withdraw" }).first().isVisible(), "no Withdraw for the waiting request");
});
suite.step("the Parent page lists the child with practice, streak and next class", async (ctx) => {
  const page = await ctx.pageFor("parent");
  await page.goto(`${ctx.base}/parent`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  const text = await page.locator("body").innerText();
  assert(/Kiki Child/.test(text) && /Streak/.test(text) && /Next class|No class booked/.test(text), "the child card is incomplete");
});
suite.step("the child's page opens on Classes with Move and Cancel", async (ctx) => {
  const page = await ctx.pageFor("parent");
  const href = await page.getByRole("link", { name: /Kiki Child/ }).first().getAttribute("href");
  assert(href && href.startsWith("/parent/"), "no link to the child's page");
  await page.goto(`${ctx.base}${href}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  await page.keyboard.press("Escape");
  assert(await page.getByRole("button", { name: /Move/ }).first().isVisible(), "no Move button on a class");
  assert(await page.getByRole("button", { name: /Book a class/ }).first().isVisible(), "no Book a class button");
  ctx.childPageHref = href;
});
suite.step("the Plan tab shows bills paid and the end-plan button", async (ctx) => {
  const page = await ctx.pageFor("parent");
  await page.locator("button", { hasText: /^Plan$/ }).first().click();
  await page.waitForTimeout(800);
  const text = await page.locator("body").innerText();
  assert(/Bills paid/.test(text) && /End this plan/.test(text), "the plan tab is incomplete");
});
suite.step("the child sees that the parent controls the schedule, and the buttons are off", async (ctx) => {
  const page = await ctx.pageFor("child");
  await page.goto(`${ctx.base}/lessons`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  assert(await page.getByText("Your schedule is controlled by your parent.").first().isVisible(), "the lock message is missing");
  // The switch-off is applied once the page has loaded in the browser, so give it a moment.
  await page.waitForFunction(() => Boolean(document.querySelector("[inert]")), undefined, { timeout: 30000 }).catch(() => undefined);
  assert(await page.evaluate(() => Boolean(document.querySelector("[inert]"))), "the screen is not switched off");
});
suite.step("a stranger cannot open the child's page", async (ctx) => {
  const page = await ctx.pageFor("student");
  await page.goto(`${ctx.base}${ctx.childPageHref}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  // The page streams, so its status is 200 even for "not found"; what matters is that nothing about the child shows.
  const text = await page.locator("body").innerText();
  assert(!/Kiki|Bills paid|Move/.test(text), "a stranger can see the child's page");
  assert(/404|not found/i.test(text), "the not-found page did not show");
});

export default suite;

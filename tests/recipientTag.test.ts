import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isWrongRecipient, maskEmail, recipientTag, tagAppLinks } from "@/lib/recipientTag";

const saved = { url: process.env.NEXTAUTH_URL, secret: process.env.NEXTAUTH_SECRET };
beforeAll(() => {
  process.env.NEXTAUTH_URL = "https://app.example.test";
  process.env.NEXTAUTH_SECRET = "unit-test-secret";
});
afterAll(() => {
  process.env.NEXTAUTH_URL = saved.url;
  process.env.NEXTAUTH_SECRET = saved.secret;
});

const sean = "seanweinberg8@gmail.com";
const isaac = "isaacberhanu777@gmail.com";

describe("who an emailed link is for", () => {
  it("makes a stable tag per address, ignoring case and spaces, and a different one for another address", async () => {
    const a = await recipientTag(sean);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(await recipientTag(`  ${sean.toUpperCase()} `)).toBe(a);
    expect(await recipientTag(isaac)).not.toBe(a);
  });

  it("masks an address without giving it away", () => {
    expect(maskEmail(sean)).toBe("s***8@gmail.com");
    expect(maskEmail("ab@x.com")).toBe("a***@x.com");
    expect(maskEmail("nonsense")).toBe("an account");
  });

  it("tags every in-app link in an email (HTML and plain text) and leaves the rest alone", async () => {
    const html =
      `<a href="https://app.example.test/billing/plans">View your plan</a> ` +
      `<a href="https://app.example.test/lessons?tab=extra">Lessons</a> ` +
      `<img src="https://app.example.test/logo-mark.png"> ` +
      `<a href="https://app.example.test/api/reminders/installment?d=1&a=2">Remind me</a> ` +
      `<a href="https://app.example.test/reset-password?token=abc">Reset</a> ` +
      `<a href="https://elsewhere.test/billing/plans">Other site</a> <a href="mailto:music@bassnotepiano.com">Write</a>`;
    const out = await tagAppLinks(html, sean);
    const tag = await recipientTag(sean);
    expect(out).toContain(`https://app.example.test/billing/plans?r=${tag}&rm=s***8%40gmail.com`);
    expect(out).toContain(`https://app.example.test/lessons?tab=extra&r=${tag}&rm=`);
    expect(out).toContain('src="https://app.example.test/logo-mark.png"');
    expect(out).toContain("https://app.example.test/api/reminders/installment?d=1&a=2");
    expect(out).toContain(`https://app.example.test/reset-password?token=abc&r=${tag}&rm=`);
    expect(out).toContain('href="https://elsewhere.test/billing/plans"');
    expect(out).toContain('href="mailto:music@bassnotepiano.com"');
    expect(await tagAppLinks("Open: https://app.example.test/dashboard", sean)).toMatch(/dashboard\?r=[0-9a-f]{16}&rm=/);
  });

  it("leaves content unchanged when the app has no secret to key the tag with", async () => {
    const secret = process.env.NEXTAUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    try {
      expect(await tagAppLinks("https://app.example.test/billing/plans", sean)).toBe("https://app.example.test/billing/plans");
    } finally {
      process.env.NEXTAUTH_SECRET = secret;
    }
  });

  it("flags a link opened signed in as a different account, and only then", async () => {
    const tag = await recipientTag(sean);
    const link = new URLSearchParams({ r: tag! });
    expect(await isWrongRecipient(link, isaac)).toBe(true);
    expect(await isWrongRecipient(link, sean)).toBe(false);
    expect(await isWrongRecipient(link, "SeanWeinberg8@Gmail.com")).toBe(false);
    expect(await isWrongRecipient(new URLSearchParams(), isaac)).toBe(false);
    expect(await isWrongRecipient(link, null)).toBe(false);
    expect(await isWrongRecipient(new URLSearchParams({ r: "forged00forged00" }), sean)).toBe(true);
  });
});

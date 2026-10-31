import { describe, expect, it } from "vitest";
import { unsubscribeLinks, unsubscribeToken, verifyUnsubscribeToken } from "@/lib/unsubscribe";

describe("unsubscribe tokens", () => {
  it("verifies for the person and the kind of email they were made for, and nothing else", () => {
    const token = unsubscribeToken("user-1", "reminders")!;
    expect(verifyUnsubscribeToken("user-1", "reminders", token)).toBe(true);
    expect(verifyUnsubscribeToken("user-2", "reminders", token)).toBe(false);
    expect(verifyUnsubscribeToken("user-1", "payments", token)).toBe(false);
    expect(verifyUnsubscribeToken("user-1", "reminders", token.slice(0, -2) + "xx")).toBe(false);
    expect(verifyUnsubscribeToken("user-1", "reminders", "")).toBe(false);
  });

  it("rejects a category that is not one of the switches, so it can never name another column", () => {
    const token = unsubscribeToken("user-1", "reminders")!;
    expect(verifyUnsubscribeToken("user-1", "role", token)).toBe(false);
    expect(verifyUnsubscribeToken("user-1", "__proto__", token)).toBe(false);
  });

  it("makes a page link (for people) and a POST link (for mail apps) that carry the same proof", () => {
    process.env.NEXTAUTH_URL = "https://example.test";
    const links = unsubscribeLinks("user-1", "classes")!;
    expect(links.page.startsWith("https://example.test/unsubscribe?")).toBe(true);
    expect(links.post.startsWith("https://example.test/api/unsubscribe?")).toBe(true);
    expect(new URL(links.page).searchParams.get("t")).toBe(new URL(links.post).searchParams.get("t"));
  });
});

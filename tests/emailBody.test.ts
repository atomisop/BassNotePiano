import { describe, expect, it, vi } from "vitest";
import { bodyToHtml } from "@/lib/email";

describe("bodyToHtml", () => {
  it("splits paragraphs, keeps single line breaks and escapes", () => {
    const html = bodyToHtml("Hi <b>\nthere\n\nSecond");
    expect(html).toContain("Hi &lt;b&gt;<br />there");
    expect(html.match(/<p /g)).toHaveLength(2);
  });
  it("turns dash lines into a list", () => {
    const html = bodyToHtml("- one\n- two\n\nAfter");
    expect(html).toContain("<ul");
    expect(html.match(/<li /g)).toHaveLength(2);
  });
});

describe("dark mode", () => {
  it("tags the card, text and panel colours and ships a dark media block", async () => {
    const sent: { html: string }[] = [];
    vi.resetModules();
    vi.doMock("resend", () => ({ Resend: class { emails = { send: async (a: { html: string }) => (sent.push(a), { data: {}, error: null }) }; } }));
    process.env.RESEND_API_KEY = "x";
    const mod = await import("@/lib/email");
    await mod.sendNotificationEmailWithCta("a@b.com", "Hello", "Body", { label: "Go", url: "https://x.com" });
    const html = sent[0].html;
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).toMatch(/class="[^"]*d-page[^"]*"/);
    expect(html).toMatch(/class="[^"]*d-card[^"]*"/);
    expect(html).toMatch(/class="[^"]*d-ink[^"]*"/);
  });
});

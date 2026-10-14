import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("back button history", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("window", { history: { length: 5 }, location: { origin: "https://site.test" } });
    vi.stubGlobal("document", { referrer: "" });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("goes back to the real previous page once there is one in the app", async () => {
    const { recordNavigation, canGoBackInApp } = await import("@/lib/navHistory");
    recordNavigation("/account");
    expect(canGoBackInApp()).toBe(false);
    recordNavigation("/billing/plans");
    expect(canGoBackInApp()).toBe(true);
  });

  it("stepping back removes the page you left, so Back never loops", async () => {
    const { recordNavigation, canGoBackInApp } = await import("@/lib/navHistory");
    recordNavigation("/account");
    recordNavigation("/billing/plans");
    recordNavigation("/account"); // went back
    expect(canGoBackInApp()).toBe(false);
  });

  it("after a reload it trusts a referrer from this site, and only this site", async () => {
    const { canGoBackInApp } = await import("@/lib/navHistory");
    vi.stubGlobal("document", { referrer: "https://site.test/account" });
    expect(canGoBackInApp()).toBe(true);
    vi.stubGlobal("document", { referrer: "https://elsewhere.test/page" });
    expect(canGoBackInApp()).toBe(false);
    vi.stubGlobal("document", { referrer: "" });
    expect(canGoBackInApp()).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { ADMIN_HUBS, allAdminPages, hubWaiting, locateAdminPage } from "@/lib/adminNav";

describe("admin menu", () => {
  it("has six choices", () => {
    expect(ADMIN_HUBS.map((h) => h.label)).toEqual(["Overview", "Billing", "People", "Classes", "Inbox", "Setup"]);
  });

  it("lists every page once, so no page is missing and none is repeated", () => {
    const hrefs = allAdminPages().map((p) => p.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toHaveLength(19);
    // The pages the old menu had.
    for (const href of ["/admin", "/admin/activity", "/admin/payments", "/admin/payment-plans", "/admin/pricing", "/admin/students", "/admin/users", "/admin/contacts", "/admin/employees", "/admin/today", "/admin/schedule", "/admin/lessons", "/admin/discord", "/admin/support", "/admin/messages", "/admin/sent", "/admin/settings", "/admin/security", "/admin/roadmaps"]) {
      expect(hrefs).toContain(href);
    }
  });

  it("keeps each hub short enough for its tabs to fit across a phone", () => {
    for (const hub of ADMIN_HUBS) expect(hub.pages.length).toBeLessThanOrEqual(4);
  });
});

describe("locateAdminPage", () => {
  it("finds the hub and page for an address", () => {
    expect(locateAdminPage("/admin/payments")?.hub.id).toBe("billing");
    expect(locateAdminPage("/admin/today")?.hub.id).toBe("classes");
    expect(locateAdminPage("/admin/security")?.hub.id).toBe("setup");
  });
  it("never reads Payment Plans as Payments, or the Overview as everything", () => {
    expect(locateAdminPage("/admin/payment-plans")?.page.label).toBe("Plans");
    expect(locateAdminPage("/admin")?.hub.id).toBe("overview");
    expect(locateAdminPage("/admin/users")?.hub.id).toBe("people");
  });
  it("counts a student's own page as Accounts", () => {
    expect(locateAdminPage("/admin/users/abc123")?.page.label).toBe("Accounts");
  });
  it("returns null for an address in no hub", () => {
    expect(locateAdminPage("/admin/unknown")).toBeNull();
    expect(locateAdminPage("/admin/paymentsx")).toBeNull();
  });
});

describe("hubWaiting", () => {
  it("adds what is waiting across a hub's pages and ignores the rest", () => {
    const billing = ADMIN_HUBS.find((h) => h.id === "billing")!;
    expect(hubWaiting(billing, { "/admin/payments": 3, "/admin/payment-plans": 2, "/admin/support": 9 })).toBe(5);
    expect(hubWaiting(billing, {})).toBe(0);
    expect(hubWaiting(billing, { "/admin/payments": -4 })).toBe(0);
  });
});

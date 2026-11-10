import { describe, expect, it } from "vitest";
import { adminPaymentsHref, paymentHref, personPaymentsHref, readAdminPaymentsParams } from "@/lib/adminPaymentLinks";

describe("links into Billing > Payments", () => {
  it("opens the review queue by default, and every status for one person or a search", () => {
    expect(readAdminPaymentsParams({}).status).toBe("PENDING_REVIEW");
    expect(readAdminPaymentsParams({ user: "u1" }).status).toBe("ALL");
    expect(readAdminPaymentsParams({ q: "jordan" }).status).toBe("ALL");
    expect(readAdminPaymentsParams({ user: "u1", status: "verified" })).toMatchObject({ status: "VERIFIED", statusGiven: true, user: "u1" });
    expect(readAdminPaymentsParams({ status: "nonsense" })).toMatchObject({ status: "PENDING_REVIEW", statusGiven: false });
  });

  it("ignores ids that could not be real, and a page that is not a number", () => {
    const view = readAdminPaymentsParams({ user: "x'; drop", id: "a".repeat(80), page: "abc", q: "   " });
    expect(view.user).toBeNull();
    expect(view.id).toBeNull();
    expect(view.q).toBeNull();
    expect(view.page).toBe(1);
  });

  it("writes the shortest address for each view and reads it back the same", () => {
    expect(adminPaymentsHref({})).toBe("/admin/payments");
    expect(adminPaymentsHref({ status: "PENDING_REVIEW" })).toBe("/admin/payments");
    expect(adminPaymentsHref({ status: "VERIFIED", page: 2 })).toBe("/admin/payments?status=VERIFIED&page=2");
    expect(personPaymentsHref("u1")).toBe("/admin/payments?user=u1");
    expect(paymentHref("p1")).toBe("/admin/payments?id=p1");
    // A search over the Pending tab keeps that tab (a search alone would show every status).
    const href = adminPaymentsHref({ status: "PENDING_REVIEW", q: "BNP-4K7Q2" });
    expect(href).toBe("/admin/payments?q=BNP-4K7Q2&status=PENDING_REVIEW");
    const back = readAdminPaymentsParams(Object.fromEntries(new URL(href, "https://x").searchParams));
    expect(back).toMatchObject({ status: "PENDING_REVIEW", q: "BNP-4K7Q2", user: null });
  });
});

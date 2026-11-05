import { describe, expect, it } from "vitest";
import { buildNeedsYou } from "@/lib/needsYou";

describe("buildNeedsYou", () => {
  it("lists only what is waiting, money first", () => {
    const rows = buildNeedsYou({ "/admin/payments": 2, "/admin/support": 1, "/admin/schedule": 0 }, [{ key: "overdue", total: 3, href: "/admin/payment-plans" }]);
    expect(rows.map((r) => r.text)).toEqual(["2 payments to approve", "3 bills overdue", "1 chat waiting for a reply"]);
    expect(rows[1].href).toBe("/admin/payment-plans");
  });
  it("is empty when nothing is waiting", () => {
    expect(buildNeedsYou({}, [])).toEqual([]);
  });
  it("uses the singular for one", () => {
    expect(buildNeedsYou({ "/admin/students": 1 }, [])[0].text).toBe("1 applicant to answer");
  });
});

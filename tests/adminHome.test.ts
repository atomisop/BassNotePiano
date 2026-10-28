import { describe, expect, it } from "vitest";
import { adminHomeRows } from "@/lib/adminHome";

describe("adminHomeRows", () => {
  const none = { classesToday: 0, supportChats: 0, paymentsToReview: 0, classesToMark: 0, applicants: 0 };

  it("always offers today's classes, and nothing else on a quiet day", () => {
    expect(adminHomeRows(none)).toEqual([{ href: "/admin/today", label: "Classes today", count: 0 }]);
  });

  it("adds only the things that are waiting, in order", () => {
    const rows = adminHomeRows({ ...none, classesToday: 3, paymentsToReview: 2, supportChats: 1 });
    expect(rows.map((r) => r.href)).toEqual(["/admin/today", "/admin/support", "/admin/payments"]);
    expect(rows[0].count).toBe(3);
  });
});

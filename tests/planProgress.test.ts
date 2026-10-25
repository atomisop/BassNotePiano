import { describe, expect, it } from "vitest";
import { planProgress } from "@/lib/planProgress";

describe("planProgress", () => {
  it("counts bills and the 28-day cycles they cover", () => {
    const p = planProgress({ installmentsPaid: 2, termMonths: 6, nextDueDate: "2026-12-01T00:00:00.000Z" });
    expect(p).toMatchObject({ billsPaid: 2, billsTotal: 6, billsLeft: 4, daysCovered: 56, daysTotal: 168, percent: 33, done: false });
    expect(p.nextBillAt?.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });
  it("has no next bill once everything is paid", () => {
    const p = planProgress({ installmentsPaid: 3, termMonths: 3, nextDueDate: "2026-12-01T00:00:00.000Z" });
    expect(p).toMatchObject({ billsLeft: 0, done: true, percent: 100, nextBillAt: null });
  });
  it("never goes past the ends", () => {
    expect(planProgress({ installmentsPaid: 9, termMonths: 3 }).billsPaid).toBe(3);
    expect(planProgress({ installmentsPaid: -1, termMonths: 3 }).billsPaid).toBe(0);
    expect(planProgress({ installmentsPaid: 0, termMonths: 0 }).billsTotal).toBe(1);
    expect(planProgress({ installmentsPaid: 0, termMonths: 1, nextDueDate: "nonsense" }).nextBillAt).toBeNull();
  });
});

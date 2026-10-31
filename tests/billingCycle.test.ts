import { describe, expect, it } from "vitest";
import { BILLING_CYCLE_DAYS, addBillingCycles } from "@/lib/billingCycle";

describe("billing cycle", () => {
  it("is four whole weeks", () => {
    expect(BILLING_CYCLE_DAYS).toBe(28);
    expect(BILLING_CYCLE_DAYS % 7).toBe(0);
  });

  it("moves a date forward and back by whole cycles, to the same weekday and time", () => {
    const start = new Date("2026-10-26T18:30:00.000Z"); // a Monday
    const next = addBillingCycles(start, 1);
    expect(next.toISOString()).toBe("2026-11-23T18:30:00.000Z");
    expect(next.getUTCDay()).toBe(start.getUTCDay());
    expect(addBillingCycles(next, -1).getTime()).toBe(start.getTime());
    expect(addBillingCycles(start, 0).getTime()).toBe(start.getTime());
  });

  it("is the same length in every month, February included", () => {
    for (const iso of ["2027-01-31T12:00:00.000Z", "2027-02-01T12:00:00.000Z", "2027-02-15T12:00:00.000Z", "2026-12-20T12:00:00.000Z"]) {
      const d = new Date(iso);
      expect((addBillingCycles(d, 1).getTime() - d.getTime()) / 86_400_000).toBe(28);
    }
  });

  it("holds exactly four of any weekday in a cycle, from any start", () => {
    // Count each weekday in [start, start + one cycle) for a start on every day of a year.
    const first = Date.UTC(2026, 0, 1, 15, 0, 0);
    for (let day = 0; day < 365; day++) {
      const start = new Date(first + day * 86_400_000);
      const end = addBillingCycles(start, 1);
      const counts = new Array(7).fill(0);
      for (let t = start.getTime(); t < end.getTime(); t += 86_400_000) counts[new Date(t).getUTCDay()]++;
      expect(counts).toEqual([4, 4, 4, 4, 4, 4, 4]);
    }
  });
});

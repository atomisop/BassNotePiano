import { describe, expect, it } from "vitest";
import { planHoldsOccurrence } from "@/lib/planHold";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("planHoldsOccurrence", () => {
  it("holds the time for a plan with no classes on the calendar yet", () => {
    expect(planHoldsOccurrence([], d("2026-11-07"))).toBe(true);
  });
  it("does not hold a week before the plan's first class (starts next Saturday)", () => {
    const bookings = [{ occurrenceDate: d("2026-11-14"), status: "SCHEDULED" }];
    expect(planHoldsOccurrence(bookings, d("2026-11-07"))).toBe(false);
    expect(planHoldsOccurrence(bookings, d("2026-11-14"))).toBe(true);
    expect(planHoldsOccurrence(bookings, d("2026-11-21"))).toBe(true);
  });
  it("frees a week whose class was skipped or canceled", () => {
    const bookings = [
      { occurrenceDate: d("2026-10-31"), status: "COMPLETED" },
      { occurrenceDate: d("2026-11-07"), status: "CANCELED" },
      { occurrenceDate: d("2026-11-14"), status: "SCHEDULED" },
    ];
    expect(planHoldsOccurrence(bookings, d("2026-11-07"))).toBe(false);
    expect(planHoldsOccurrence(bookings, d("2026-11-14"))).toBe(true);
  });
  it("keeps a week held when a class was moved onto it as well", () => {
    const bookings = [
      { occurrenceDate: d("2026-11-07"), status: "CANCELED" },
      { occurrenceDate: d("2026-11-07"), status: "SCHEDULED" },
    ];
    expect(planHoldsOccurrence(bookings, d("2026-11-07"))).toBe(true);
  });
});

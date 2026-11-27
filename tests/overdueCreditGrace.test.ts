import { describe, expect, it } from "vitest";
import { overdueGraceEligible } from "@/lib/overdueCreditGrace";

const now = new Date("2026-11-26T15:00:00Z");
const DAY = 86_400_000;
const base = {
  graceEnabled: true,
  installmentsPaid: 2,
  nextDueDate: new Date(now.getTime() - 3 * DAY),
  now,
  alreadyGraced: false,
  availableCredits: 0,
  creditsPerClass: 1, // a 30-minute cadence's weekly cost, in stored (half-class) units
};

describe("overdueGraceEligible", () => {
  it("allows an established payer, overdue, not yet graced, with no negative balance", () => {
    expect(overdueGraceEligible(base)).toBe(true);
    expect(overdueGraceEligible({ ...base, availableCredits: 4 })).toBe(true);
  });

  it("refuses when the setting is off", () => {
    expect(overdueGraceEligible({ ...base, graceEnabled: false })).toBe(false);
  });

  it("refuses a first-time payer (never paid a bill yet)", () => {
    expect(overdueGraceEligible({ ...base, installmentsPaid: 0 })).toBe(false);
  });

  it("refuses when the bill isn't actually overdue yet", () => {
    expect(overdueGraceEligible({ ...base, nextDueDate: new Date(now.getTime() + DAY) })).toBe(false);
    expect(overdueGraceEligible({ ...base, nextDueDate: now })).toBe(false);
  });

  it("refuses a second grace class once one is already booked for this overdue stretch", () => {
    expect(overdueGraceEligible({ ...base, alreadyGraced: true })).toBe(false);
  });

  it("refuses once the balance is already negative (the grace was already spent and attended)", () => {
    expect(overdueGraceEligible({ ...base, availableCredits: -1 })).toBe(false);
  });

  it("allows a 60-minute cadence's full 2-credit class from a 0 balance, landing at exactly -1 credit", () => {
    // CREDITS_PER_CLASS is 2 (one credit = two stored half-class units), and a 60-minute
    // cadence costs 2 stored units a week, so this is the real worst case the floor must hold.
    expect(overdueGraceEligible({ ...base, availableCredits: 0, creditsPerClass: 2 })).toBe(true);
  });

  it("refuses a class that would land more than one credit negative", () => {
    // A 0 balance and a 3-stored-unit class would land at -3, past the -2 (one credit) floor.
    expect(overdueGraceEligible({ ...base, availableCredits: 0, creditsPerClass: 3 })).toBe(false);
    // A 60-minute cadence's 2-unit class from an already -1 balance would land at -3.
    expect(overdueGraceEligible({ ...base, availableCredits: -1, creditsPerClass: 2 })).toBe(false);
  });
});

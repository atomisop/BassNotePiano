import { describe, expect, it } from "vitest";
import { changeLabel, summariseRevenue } from "@/lib/revenueSummary";

const now = new Date("2026-10-30T20:00:00Z"); // Friday afternoon in New York
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

describe("summariseRevenue", () => {
  const rows = [
    { at: daysAgo(1), amountCents: 16499 },
    { at: daysAgo(6.9), amountCents: 1000 },
    { at: daysAgo(8), amountCents: 2000 }, // last week, still October
    { at: daysAgo(35), amountCents: 5000 }, // September
    { at: daysAgo(400), amountCents: 9999 }, // too old for any bucket
  ];
  const s = summariseRevenue(rows, now, 8, 6);

  it("adds the last 7 days and the 7 before them", () => {
    expect(s.weekCents).toBe(17499);
    expect(s.prevWeekCents).toBe(2000);
  });

  it("adds this calendar month and last month", () => {
    expect(s.monthCents).toBe(19499);
    expect(s.prevMonthCents).toBe(5000);
  });

  it("buckets weeks and months oldest first, ending now", () => {
    expect(s.weeks).toHaveLength(8);
    expect(s.weeks[7].cents).toBe(17499);
    expect(s.weeks[6].cents).toBe(2000);
    expect(s.months.map((m) => m.label)).toEqual(["May", "Jun", "Jul", "Aug", "Sep", "Oct"]);
    expect(s.months[5].cents).toBe(19499);
    expect(s.months[4].cents).toBe(5000);
  });

  it("crosses a year boundary", () => {
    expect(summariseRevenue([], new Date("2026-02-10T12:00:00Z"), 1, 4).months.map((m) => m.label)).toEqual(["Nov", "Dec", "Jan", "Feb"]);
  });
});

describe("changeLabel", () => {
  it("says the change, or nothing without a base", () => {
    expect(changeLabel(150, 100)).toBe("+50%");
    expect(changeLabel(50, 100)).toBe("-50%");
    expect(changeLabel(50, 0)).toBeNull();
  });
});

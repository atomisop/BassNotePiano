import { describe, expect, it } from "vitest";
import { longestStreak } from "@/lib/fingerPractice";

describe("longestStreak", () => {
  it("finds the longest run of days in a row, across a month end", () => {
    expect(longestStreak(new Set(["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-05", "2026-10-06"]))).toBe(3);
    expect(longestStreak(new Set(["2026-10-05"]))).toBe(1);
    expect(longestStreak(new Set())).toBe(0);
  });
});

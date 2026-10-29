import { describe, expect, it } from "vitest";
import { longestStreak, nextStreakGoal, practicedThisMonth, streakCalendar } from "@/lib/streakRules";

describe("longestStreak", () => {
  it("finds the longest run, across a month end and ignoring repeats", () => {
    expect(longestStreak([])).toBe(0);
    expect(longestStreak(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-03", "2026-11-01"])).toBe(3);
    expect(longestStreak(["2026-01-05", "2026-01-07"])).toBe(1);
  });
});

describe("nextStreakGoal", () => {
  it("is the first goal above the streak", () => {
    expect(nextStreakGoal(0)).toBe(3);
    expect(nextStreakGoal(3)).toBe(7);
    expect(nextStreakGoal(400)).toBeNull();
  });
});

describe("streakCalendar", () => {
  it("ends on the week holding today, Sunday first, future days marked", () => {
    // 2026-10-29 is a Thursday.
    const grid = streakCalendar(["2026-10-27", "2026-10-20"], "2026-10-29", 2);
    expect(grid).toHaveLength(2);
    expect(grid[1][0].day).toBe("2026-10-25");
    expect(grid[1][4]).toMatchObject({ day: "2026-10-29", isToday: true, future: false });
    expect(grid[1][5].future).toBe(true);
    expect(grid[1][2].practiced).toBe(true);
    expect(grid[0][2]).toMatchObject({ day: "2026-10-20", practiced: true });
  });
});

describe("practicedThisMonth", () => {
  it("counts only this month up to today", () => {
    expect(practicedThisMonth(["2026-10-01", "2026-10-29", "2026-09-30", "2026-10-29"], "2026-10-29")).toBe(2);
  });
});

import { describe, expect, it } from "vitest";
import { buildPracticeStrip, doneInLast7, minutesInLast7, recentDayKeys } from "@/lib/practiceActivityRules";

const done = (day: string) => ({ day, seconds: 600, completedAt: new Date() });

describe("practice activity for the teacher", () => {
  it("lists the last days oldest first, across a month end", () => {
    expect(recentDayKeys("2026-03-02", 4)).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
  });

  it("marks done, partial and missed days", () => {
    const strip = buildPracticeStrip(
      [done("2026-10-14"), { day: "2026-10-13", seconds: 200, completedAt: null }, { day: "2026-10-12", seconds: 0, completedAt: null }],
      "2026-10-14",
      4,
    );
    expect(strip.map((d) => d.state)).toEqual(["missed", "missed", "partial", "done"]);
    expect(strip[2].seconds).toBe(200);
  });

  it("counts the last 7 days and the minutes in them", () => {
    const strip = buildPracticeStrip([done("2026-10-14"), done("2026-10-13"), { day: "2026-10-12", seconds: 125, completedAt: null }, done("2026-10-01")], "2026-10-14", 30);
    expect(doneInLast7(strip)).toBe(2);
    expect(minutesInLast7(strip)).toBe(22);
  });

  it("caps a day at the goal and ignores rows outside the window", () => {
    const strip = buildPracticeStrip([{ day: "2026-10-14", seconds: 9999, completedAt: null }, done("2020-01-01")], "2026-10-14", 3);
    expect(strip[2]).toMatchObject({ seconds: 600, state: "done" });
    expect(strip.filter((d) => d.state === "done")).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";
import { dayTitle, dayWord, easternDay, easternDayStart, easternDayWindow, parseDayParam, shiftDay, todayHref } from "@/lib/teachingDayRules";

describe("the Today screen's days", () => {
  it("reads a real ?day= and falls back to today for anything else", () => {
    expect(parseDayParam("2026-11-12", "2026-11-09")).toBe("2026-11-12");
    expect(parseDayParam(["2026-11-12", "2026-11-13"], "2026-11-09")).toBe("2026-11-12");
    expect(parseDayParam(undefined, "2026-11-09")).toBe("2026-11-09");
    expect(parseDayParam("2026-02-31", "2026-11-09")).toBe("2026-11-09");
    expect(parseDayParam("tomorrow", "2026-11-09")).toBe("2026-11-09");
    expect(parseDayParam("1890-01-01", "2026-11-09")).toBe("2026-11-09");
  });

  it("steps a day back and forward across months and years", () => {
    expect(shiftDay("2026-11-30", 1)).toBe("2026-12-01");
    expect(shiftDay("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("finds Eastern midnight in summer and winter time, and on the days the clocks change", () => {
    expect(easternDayStart("2026-07-04").toISOString()).toBe("2026-07-04T04:00:00.000Z");
    expect(easternDayStart("2026-12-25").toISOString()).toBe("2026-12-25T05:00:00.000Z");
    // Clocks go forward at 2am on March 8, 2026, so midnight is still winter time; back at 2am on November 1, so midnight is summer time.
    expect(easternDayStart("2026-03-08").toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(easternDayStart("2026-11-01").toISOString()).toBe("2026-11-01T04:00:00.000Z");
    for (const key of ["2026-03-08", "2026-11-01", "2026-07-04"]) {
      const { from, to } = easternDayWindow(key);
      expect(easternDay(from)).toBe(key);
      expect(easternDay(new Date(from.getTime() - 1))).toBe(shiftDay(key, -1));
      expect(easternDay(to)).toBe(shiftDay(key, 1));
    }
  });

  it("names the day the way a person says it", () => {
    expect(dayWord("2026-11-09", "2026-11-09")).toBe("Today");
    expect(dayWord("2026-11-10", "2026-11-09")).toBe("Tomorrow");
    expect(dayWord("2026-11-08", "2026-11-09")).toBe("Yesterday");
    expect(dayWord("2026-11-12", "2026-11-09")).toBe("Thursday");
    expect(dayTitle("2026-11-09", "2026-11-09")).toBe("Today, November 9");
    expect(dayTitle("2026-11-12", "2026-11-09")).toBe("Thursday, November 12");
  });

  it("keeps today's address short", () => {
    expect(todayHref("2026-11-09", "2026-11-09")).toBe("/admin/schedule?view=TODAY");
    expect(todayHref("2026-11-12", "2026-11-09")).toBe("/admin/schedule?view=TODAY&day=2026-11-12");
  });
});

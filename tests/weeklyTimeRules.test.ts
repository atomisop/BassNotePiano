import { describe, expect, it } from "vitest";
import {
  addDaysYmd,
  checkDayMoves,
  clashesFrom,
  clashSummary,
  clockLabel,
  firstClearDate,
  firstNameOf,
  fitRefusal,
  fitWeeklyTime,
  matchWindowClasses,
  namesList,
  parseWeeklyTime,
  sameWeekOn,
  weekdayDay,
  weeklyTimeLabel,
} from "@/lib/weeklyTimeRules";

describe("parseWeeklyTime", () => {
  it("takes a real day and a start on a 5 minute mark, written the way the schedule stores it", () => {
    expect(parseWeeklyTime({ dayOfWeek: 2, startTime: "16:00" })).toEqual({ dayOfWeek: 2, startTime: "16:00" });
    expect(parseWeeklyTime({ dayOfWeek: "0", startTime: "9:30" })).toEqual({ dayOfWeek: 0, startTime: "09:30" });
  });

  it("refuses a day that is not one, a time that is not one, an odd minute and a class past midnight", () => {
    expect(parseWeeklyTime({ dayOfWeek: 7, startTime: "16:00" })).toHaveProperty("error");
    expect(parseWeeklyTime({ dayOfWeek: 1.5, startTime: "16:00" })).toHaveProperty("error");
    expect(parseWeeklyTime({ dayOfWeek: 1, startTime: "" })).toHaveProperty("error");
    expect(parseWeeklyTime({ dayOfWeek: 1, startTime: "25:00" })).toHaveProperty("error");
    expect(parseWeeklyTime({ dayOfWeek: 1, startTime: "16:07" })).toHaveProperty("error");
    expect(parseWeeklyTime({ dayOfWeek: 1, startTime: "23:30" })).toHaveProperty("error");
    expect(parseWeeklyTime({ dayOfWeek: 1, startTime: "23:15" })).toEqual({ dayOfWeek: 1, startTime: "23:15" });
  });
});

describe("fitWeeklyTime", () => {
  // Tuesday 4:00 PM to 6:00 PM holds two classes, at 4:00 and 5:00.
  const windows = [{ id: "tue", dayOfWeek: 2, startTime: "16:00", chunkOffsets: [0, 60] }];

  it("uses a window's class when the typed time is one", () => {
    expect(fitWeeklyTime(windows, { dayOfWeek: 2, startTime: "17:00" })).toEqual({ kind: "existing", scheduleId: "tue", chunkIndex: 1 });
  });

  it("refuses a time that runs into a class, and says which", () => {
    const fit = fitWeeklyTime(windows, { dayOfWeek: 2, startTime: "16:30" });
    expect(fit).toEqual({ kind: "overlap", scheduleId: "tue", classStart: "16:00" });
    expect(fitRefusal(fit, 2)).toBe("That runs into the 4:00 PM class on Tuesdays. Pick 4:00 PM itself, or a time that does not touch it.");
  });

  it("makes a new time for open time: right after a class, another day, or a window about to be retired", () => {
    expect(fitWeeklyTime(windows, { dayOfWeek: 2, startTime: "18:00" })).toEqual({ kind: "new" });
    expect(fitWeeklyTime(windows, { dayOfWeek: 2, startTime: "15:15" })).toEqual({ kind: "new" });
    expect(fitWeeklyTime(windows, { dayOfWeek: 3, startTime: "16:00" })).toEqual({ kind: "new" });
    expect(fitWeeklyTime(windows, { dayOfWeek: 2, startTime: "16:30" }, ["tue"])).toEqual({ kind: "new" });
    expect(fitRefusal({ kind: "new" }, 2)).toBeNull();
  });
});

describe("clashes named, not hidden", () => {
  const sam = { firstName: "Sam", date: "2026-12-02" };
  const sam2 = { firstName: "Sam", date: "2026-12-09" };
  const ann = { firstName: "Ann", date: "2026-12-16" };

  it("says who has which week", () => {
    expect(clashSummary([])).toBe("");
    expect(clashSummary([sam])).toBe("Sam has Dec 2");
    expect(clashSummary([sam2, sam])).toBe("Sam has Dec 2 and Dec 9");
    expect(clashSummary([sam, sam2, { firstName: "Sam", date: "2026-12-23" }])).toBe("Sam has Dec 2 and 2 more");
    expect(clashSummary([ann, sam])).toBe("Sam has Dec 2, Ann has Dec 16");
    expect(clashSummary([ann, sam, sam2])).toBe("Sam has Dec 2, Ann has Dec 16 and 1 more");
  });

  it("finds the first week after every clash, and which clashes a first class runs into", () => {
    const dates = ["2026-11-25", "2026-12-02", "2026-12-09", "2026-12-16", "2026-12-23"];
    expect(firstClearDate(dates, [])).toBe("2026-11-25");
    expect(firstClearDate(dates, ["2026-12-02"])).toBe("2026-12-09");
    expect(firstClearDate(dates, ["2026-12-09", "2026-12-02"])).toBe("2026-12-16");
    expect(firstClearDate(dates, ["2027-01-06"])).toBeNull();
    expect(clashesFrom([sam, sam2, ann], "2026-12-09")).toEqual([sam2, ann]);
    expect(clashesFrom([sam], "2026-12-09")).toEqual([]);
  });
});

describe("moving a window with everyone on it", () => {
  it("keeps each class at the same place in the new window, or says the new one is too short", () => {
    const ok = matchWindowClasses([0, 1], 2);
    expect("map" in ok && [...ok.map.entries()]).toEqual([
      [0, 0],
      [1, 1],
    ]);
    expect(matchWindowClasses([1], 1)).toHaveProperty("error");
    expect(matchWindowClasses([], 1)).toEqual({ map: new Map() });
  });

  it("puts a class into the same Sunday to Saturday week on the new day", () => {
    // Tuesday Dec 1 2026 to Thursday is Dec 3; to Monday is Nov 30.
    expect(sameWeekOn("2026-12-01", 2, 4)).toBe("2026-12-03");
    expect(sameWeekOn("2026-12-01", 2, 1)).toBe("2026-11-30");
    expect(addDaysYmd("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("checkDayMoves", () => {
  const ids = ["a", "b"];
  it("takes every class of the day, each to a real day and time off the closed day", () => {
    const moves = [
      { bookingId: "a", date: "2026-11-27", time: "16:00" },
      { bookingId: "b", date: "2026-11-27", time: "9:00" },
    ];
    expect(checkDayMoves("2026-11-26", ids, moves)).toEqual({ moves: [moves[0], { ...moves[1], time: "09:00" }] });
  });

  it("refuses a class left out, one listed twice, a missing time and the closed day itself", () => {
    expect(checkDayMoves("2026-11-26", ids, [{ bookingId: "a", date: "2026-11-27", time: "16:00" }])).toHaveProperty("error");
    expect(checkDayMoves("2026-11-26", ids, [{ bookingId: "a", date: "2026-11-27", time: "16:00" }, { bookingId: "a", date: "2026-11-28", time: "16:00" }])).toHaveProperty("error");
    expect(checkDayMoves("2026-11-26", ids, [{ bookingId: "a", date: "2026-11-27", time: "" }, { bookingId: "b", date: "2026-11-27", time: "16:00" }])).toHaveProperty("error");
    expect(checkDayMoves("2026-11-26", ids, [{ bookingId: "a", date: "2026-11-26", time: "17:00" }, { bookingId: "b", date: "2026-11-27", time: "16:00" }])).toEqual({
      error: "Pick another day: that one is being closed.",
    });
  });
});

describe("wording", () => {
  it("reads times, days and names the way the studio says them", () => {
    expect(clockLabel("16:00")).toBe("4:00 PM");
    expect(clockLabel("00:30")).toBe("12:30 AM");
    expect(weeklyTimeLabel(2, "16:00")).toBe("Tuesday 4:00 PM to 4:45 PM");
    expect(weekdayDay("2026-12-02")).toBe("Wed, Dec 2");
    expect(firstNameOf("Sam Lee", "sam@example.com")).toBe("Sam");
    expect(firstNameOf(null, "sam@example.com")).toBe("sam");
    expect(namesList(["Ann"])).toBe("Ann");
    expect(namesList(["Ann", "Bo"])).toBe("Ann and Bo");
    expect(namesList(["Ann", "Bo", "Cy"])).toBe("Ann, Bo and Cy");
    expect(namesList(["Ann", "Bo", "Cy", "Di"])).toBe("Ann, Bo and 2 more");
  });
});

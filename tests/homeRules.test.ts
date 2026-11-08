import { describe, expect, it } from "vitest";
import { TIPS, minutesThisWeek, pickCelebration, tipOfTheDay, weekDayIndex, weekDayMinutes, weekStartKey, type Win } from "@/lib/homeRules";

describe("weekStartKey", () => {
  it("is the Sunday on or before the day", () => {
    expect(weekStartKey("2026-10-25")).toBe("2026-10-25"); // a Sunday
    expect(weekStartKey("2026-10-29")).toBe("2026-10-25"); // Thursday
    expect(weekStartKey("2026-11-01")).toBe("2026-11-01");
    expect(weekStartKey("2026-10-31")).toBe("2026-10-25"); // Saturday
  });
});

describe("minutesThisWeek", () => {
  it("adds whole minutes from Sunday to today only", () => {
    const rows = [
      { day: "2026-10-24", seconds: 600 }, // last Saturday
      { day: "2026-10-25", seconds: 600 },
      { day: "2026-10-27", seconds: 330 },
      { day: "2026-10-30", seconds: 600 }, // after today
    ];
    expect(minutesThisWeek(rows, "2026-10-29")).toBe(15);
    expect(minutesThisWeek([], "2026-10-29")).toBe(0);
  });
});

describe("tipOfTheDay", () => {
  it("stays the same all day and changes the next day", () => {
    expect(tipOfTheDay("2026-10-29")).toEqual(tipOfTheDay("2026-10-29"));
    expect(tipOfTheDay("2026-10-29")).not.toEqual(tipOfTheDay("2026-10-30"));
    expect(TIPS.length).toBeGreaterThan(7);
    for (const t of TIPS) expect(`${t.title}${t.body}`).not.toMatch(/—/);
  });
});

describe("pickCelebration", () => {
  const now = new Date("2026-10-29T15:00:00Z");
  const win = (key: string, daysAgo: number): Win => ({ kind: "badge", key, title: key, detail: "", at: new Date(now.getTime() - daysAgo * 86_400_000) });
  it("chooses the newest win in the last week", () => {
    expect(pickCelebration([win("a", 3), win("b", 1), win("c", 5)], now)?.key).toBe("b");
  });
  it("ignores wins older than the window", () => {
    expect(pickCelebration([win("old", 9)], now)).toBeNull();
    expect(pickCelebration([], now)).toBeNull();
  });
});

describe("weekDayMinutes", () => {
  it("gives each day of the week from Sunday, nothing after today and nothing from last week", () => {
    // 2026-10-29 is a Thursday; the week started Sunday 2026-10-25.
    const rows = [
      { day: "2026-10-24", seconds: 900 },
      { day: "2026-10-25", seconds: 600 },
      { day: "2026-10-27", seconds: 300 },
      { day: "2026-10-27", seconds: 330 },
      { day: "2026-10-29", seconds: 59 },
    ];
    expect(weekDayMinutes(rows, "2026-10-29")).toEqual([10, 0, 10, 0, 0, 0, 0]);
    expect(weekDayIndex("2026-10-29")).toBe(4);
    expect(weekDayIndex("2026-10-25")).toBe(0);
  });
});

import { joinReadiness } from "@/lib/homeRules";

describe("joinReadiness", () => {
  const start = new Date("2026-11-10T20:00:00Z");
  const at = (offsetMin: number) => new Date(start.getTime() - offsetMin * 60_000);
  it("is not ready a day ahead and says when it opens", () => {
    expect(joinReadiness({ scheduledAt: start, inPerson: false, now: at(1440) })).toEqual({ ready: false, text: "Join opens 30 minutes before" });
  });
  it("is ready from 30 minutes before", () => {
    expect(joinReadiness({ scheduledAt: start, inPerson: false, now: at(30) }).ready).toBe(true);
    expect(joinReadiness({ scheduledAt: start, inPerson: false, now: at(31) }).ready).toBe(false);
  });
  it("is still open during the class and closed an hour after it starts", () => {
    expect(joinReadiness({ scheduledAt: start, inPerson: false, now: at(-20) }).ready).toBe(true);
    expect(joinReadiness({ scheduledAt: start, inPerson: false, now: at(-61) }).text).toBe("This class has ended");
  });
  it("never offers a link for an in-person class", () => {
    expect(joinReadiness({ scheduledAt: start, inPerson: true, now: at(5) })).toEqual({ ready: false, text: "In person, no link needed" });
  });
});

import { describe, expect, it } from "vitest";
import { chunksForSchedule, classesInWindow } from "@/lib/classSchedule";

const monday = { dayOfWeek: 1, startTime: "17:00", durationMin: 45 };
const chunk = chunksForSchedule(monday)[0];
const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));

describe("how many classes a paid month holds", () => {
  it("counts five Mondays when the cycle starts on one of five (Nov 2 to Dec 2, 2026)", () => {
    expect(classesInWindow(monday, chunk, d(2026, 11, 2), d(2026, 12, 2))).toBe(5);
  });
  it("counts four in the next cycle (Dec 2 to Jan 2)", () => {
    expect(classesInWindow(monday, chunk, d(2026, 12, 2), d(2027, 1, 2))).toBe(4);
  });
  it("is not only for someone who pays on the 2nd: an Oct 15 subscriber has four, then five", () => {
    expect(classesInWindow(monday, chunk, d(2026, 10, 15), d(2026, 11, 15))).toBe(4);
    expect(classesInWindow(monday, chunk, d(2026, 11, 15), d(2026, 12, 15))).toBe(5);
  });
  it("is exactly four in a 28 day cycle, and other weekdays follow their own count", () => {
    expect(classesInWindow(monday, chunk, d(2027, 2, 1), d(2027, 3, 1))).toBe(4);
    const wednesday = { dayOfWeek: 3, startTime: "17:00", durationMin: 45 };
    expect(classesInWindow(wednesday, chunk, d(2026, 11, 2), d(2026, 12, 2))).toBe(4);
  });
  it("a class that starts before the cycle does not count, and one starting at the next billing moment belongs to the next cycle", () => {
    // Monday Nov 2 17:00 ET is 22:00Z: a cycle that starts after it does not hold it.
    expect(classesInWindow(monday, chunk, new Date(Date.UTC(2026, 10, 2, 23)), d(2026, 12, 2))).toBe(4);
  });
});

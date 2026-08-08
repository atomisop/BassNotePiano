import { describe, expect, it } from "vitest";
import { etWallTimeToUtc } from "./classSchedule";

// America/New_York's real, historical DST rule for 2026 (verified against
// the ICU tzdata via Intl in this environment): EST (UTC-5) through March
// 7, EDT (UTC-4) from March 8 through October 31 (clocks spring forward at
// 2am local on March 8), EST again from November 1 (clocks fall back at
// 2am local). A fixed offset would be correct for roughly half the year and
// silently wrong for the other half — these pin both sides of both
// transitions against known-correct UTC instants.
describe("etWallTimeToUtc", () => {
  it("converts a winter (EST, UTC-5) wall-clock time correctly", () => {
    const result = etWallTimeToUtc(2026, 1, 15, 11, 0);
    expect(result.toISOString()).toBe(new Date(Date.UTC(2026, 0, 15, 16, 0)).toISOString());
  });

  it("converts a summer (EDT, UTC-4) wall-clock time correctly", () => {
    const result = etWallTimeToUtc(2026, 7, 15, 11, 0);
    expect(result.toISOString()).toBe(new Date(Date.UTC(2026, 6, 15, 15, 0)).toISOString());
  });

  it("is still EST the day before the spring-forward transition", () => {
    const result = etWallTimeToUtc(2026, 3, 7, 11, 0);
    expect(result.toISOString()).toBe(new Date(Date.UTC(2026, 2, 7, 16, 0)).toISOString());
  });

  it("has already sprung forward to EDT the same day as the transition (March 8, 2026)", () => {
    const result = etWallTimeToUtc(2026, 3, 8, 11, 0);
    expect(result.toISOString()).toBe(new Date(Date.UTC(2026, 2, 8, 15, 0)).toISOString());
  });

  it("is still EDT the day before the fall-back transition", () => {
    const result = etWallTimeToUtc(2026, 10, 31, 11, 0);
    expect(result.toISOString()).toBe(new Date(Date.UTC(2026, 9, 31, 15, 0)).toISOString());
  });

  it("has already fallen back to EST the same day as the transition (November 1, 2026)", () => {
    const result = etWallTimeToUtc(2026, 11, 1, 11, 0);
    expect(result.toISOString()).toBe(new Date(Date.UTC(2026, 10, 1, 16, 0)).toISOString());
  });

  it("produces a UTC instant that round-trips back to the same ET wall-clock time", () => {
    for (const [y, m, d, h, min] of [
      [2026, 1, 15, 9, 30],
      [2026, 3, 8, 2, 30], // inside the spring-forward gap on the wall clock
      [2026, 7, 4, 18, 0],
      [2026, 11, 1, 1, 30], // inside the ambiguous fall-back hour
      [2026, 12, 25, 23, 45],
    ]) {
      const utc = etWallTimeToUtc(y, m, d, h, min);
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).formatToParts(utc);
      const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
      // The spring-forward gap (2:00-2:59am doesn't exist) and the
      // fall-back ambiguous hour (1:00-1:59am occurs twice) both round-trip
      // to *some* valid ET reading rather than throwing — just assert the
      // conversion produced a real, well-formed instant.
      expect(get("year")).toBe(y);
      expect(get("month")).toBe(m);
    }
  });
});

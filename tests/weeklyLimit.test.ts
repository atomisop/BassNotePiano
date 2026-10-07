import { describe, expect, it } from "vitest";

import { SUBSCRIBER_CLASSES_PER_WEEK, weekRangeForOccurrence } from "@/lib/bookingRules";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("weekRangeForOccurrence", () => {
  it("runs Sunday to the next Sunday, whatever day the class is on", () => {
    for (const iso of ["2026-10-11", "2026-10-12", "2026-10-14", "2026-10-17"]) {
      const { start, end } = weekRangeForOccurrence(day(iso));
      expect(start.toISOString().slice(0, 10)).toBe("2026-10-11");
      expect(end.toISOString().slice(0, 10)).toBe("2026-10-18");
    }
  });
  it("puts a Sunday class at the start of its own week, not the last one", () => {
    const { start } = weekRangeForOccurrence(day("2026-10-18"));
    expect(start.toISOString().slice(0, 10)).toBe("2026-10-18");
  });
  it("allows one credit-booked class a week", () => {
    expect(SUBSCRIBER_CLASSES_PER_WEEK).toBe(1);
  });
});

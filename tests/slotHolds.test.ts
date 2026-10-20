import { describe, expect, it } from "vitest";
import { holdAppliesTo, holdSlotKey, parseDay } from "@/lib/slotHolds";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("soft holds on a weekly time", () => {
  it("names a weekly hour by window and hour", () => {
    expect(holdSlotKey("abc", 2)).toBe("abc:2");
  });

  it("applies every week until released when there is no last date", () => {
    expect(holdAppliesTo({ until: null, releasedAt: null }, d("2027-03-01"))).toBe(true);
  });

  it("applies up to and including its last date, not after", () => {
    const hold = { until: d("2026-11-10"), releasedAt: null };
    expect(holdAppliesTo(hold, d("2026-11-03"))).toBe(true);
    expect(holdAppliesTo(hold, d("2026-11-10"))).toBe(true);
    expect(holdAppliesTo(hold, d("2026-11-17"))).toBe(false);
  });

  it("stops applying once released", () => {
    expect(holdAppliesTo({ until: null, releasedAt: new Date() }, d("2026-11-03"))).toBe(false);
  });

  it("reads only real YYYY-MM-DD days", () => {
    expect(parseDay("2026-11-10")?.toISOString()).toBe("2026-11-10T00:00:00.000Z");
    expect(parseDay("2026-02-30")).toBeNull();
    expect(parseDay("11/10/2026")).toBeNull();
    expect(parseDay("")).toBeNull();
    expect(parseDay(null)).toBeNull();
  });
});

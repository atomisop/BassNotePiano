import { describe, expect, it } from "vitest";
import { billDateBlockedReason, daysBetweenKeys, movedDueDate } from "@/lib/billDateRules";

const ok = { todayKey: "2026-10-31", currentKey: "2026-12-22", status: "ACTIVE", paused: false };

describe("moving a plan's next bill", () => {
  it("counts whole days between dates, across months", () => {
    expect(daysBetweenKeys("2026-11-25", "2026-12-22")).toBe(27);
    expect(daysBetweenKeys("2026-12-22", "2026-11-25")).toBe(-27);
  });

  it("allows today up to a year ahead", () => {
    expect(billDateBlockedReason({ ...ok, newDay: "2026-11-25" })).toBeNull();
    expect(billDateBlockedReason({ ...ok, newDay: "2026-10-31" })).toBeNull();
    expect(billDateBlockedReason({ ...ok, newDay: "2026-10-30" })).toMatch(/today or a later day/);
    expect(billDateBlockedReason({ ...ok, newDay: "2027-11-01" })).toMatch(/within a year/);
  });

  it("refuses a paused, ended or unchanged plan, and a bad date", () => {
    expect(billDateBlockedReason({ ...ok, newDay: "2026-11-25", paused: true })).toMatch(/Resume/);
    expect(billDateBlockedReason({ ...ok, newDay: "2026-11-25", status: "CANCELED" })).toMatch(/running plan/);
    expect(billDateBlockedReason({ ...ok, newDay: "2026-12-22" })).toMatch(/already/);
    expect(billDateBlockedReason({ ...ok, newDay: "Nov 25" })).toMatch(/Pick a date/);
  });

  it("keeps the bill's time of day", () => {
    const current = new Date("2026-12-22T16:05:00Z");
    expect(movedDueDate(current, "2026-12-22", "2026-11-25").toISOString()).toBe("2026-11-25T16:05:00.000Z");
  });
});

import { describe, expect, it } from "vitest";
import { addDays, buildPlanTimeline } from "@/lib/planTimeline";

// Oct 28, 2026 is a Wednesday (dayOfWeek 3).
const noon = (date: string) => new Date(`${date}T16:00:00Z`);
const base = { startDate: "2026-10-28", cycles: 6, installmentsPaid: 1, dayOfWeek: 3, slotAt: noon, now: new Date("2026-10-29T15:00:00Z") };

describe("buildPlanTimeline", () => {
  it("lays out four weekly classes per 28-day cycle, starting on the start day when it is the class weekday", () => {
    const t = buildPlanTimeline({ ...base, taughtDates: ["2026-10-28"] });
    expect(t.cycles).toHaveLength(6);
    expect(t.cycles[0].classes.map((c) => c.date)).toEqual(["2026-10-28", "2026-11-04", "2026-11-11", "2026-11-18"]);
    expect(t.cycles[1].classes[0].date).toBe("2026-11-25");
    expect(t.cycles[0].startsOn).toBe("2026-10-28");
    expect(t.cycles[0].endsOn).toBe("2026-11-25");
  });

  it("marks taught, booked and not-yet-paid classes, and puts the next bill 28 days after the start", () => {
    const t = buildPlanTimeline({ ...base, taughtDates: ["2026-10-28"] });
    expect(t.cycles[0].classes.map((c) => c.state)).toEqual(["taught", "booked", "booked", "booked"]);
    expect(t.cycles[1].classes.every((c) => c.state === "unpaid")).toBe(true);
    expect(t.nextBill).toBe("2026-11-25");
    expect(t.taughtCount).toBe(1);
    expect(t.bookedCount).toBe(3);
  });

  it("calls a past class nobody marked taught missed", () => {
    const t = buildPlanTimeline({ ...base, taughtDates: [], now: new Date("2026-11-06T15:00:00Z") });
    expect(t.cycles[0].classes.map((c) => c.state)).toEqual(["missed", "missed", "booked", "booked"]);
  });

  it("starts the first class on the next matching weekday when the start day is another weekday", () => {
    const t = buildPlanTimeline({ ...base, startDate: "2026-10-26", taughtDates: [] }); // a Monday
    expect(t.cycles[0].classes[0].date).toBe("2026-10-28");
    expect(t.cycles[0].classes[3].date).toBe("2026-11-18");
  });

  it("has no next bill once every cycle is paid, and addDays crosses month ends", () => {
    const t = buildPlanTimeline({ ...base, installmentsPaid: 6, taughtDates: [] });
    expect(t.nextBill).toBeNull();
    expect(addDays("2026-10-30", 5)).toBe("2026-11-04");
  });
});

import { describe, expect, it } from "vitest";
import { isPausedNow, pauseBlockedReason, pauseSpanMs, PAUSE_COOLDOWN_DAYS } from "@/lib/planPause";

const now = new Date("2026-11-02T15:00:00Z");
const DAY = 86_400_000;
const plan = { status: "ACTIVE", familyGroupId: null, installmentsPaid: 2, nextDueDate: new Date(now.getTime() + 10 * DAY), pausedAt: null as Date | null };

describe("pauseBlockedReason", () => {
  it("allows a running, paid-up plan for 1 to 4 weeks", () => {
    for (const w of [1, 2, 3, 4]) expect(pauseBlockedReason(plan, w, now)).toBeNull();
  });
  it("refuses lengths outside 1 to 4 and fractions", () => {
    for (const w of [0, 5, 1.5, -1, NaN]) expect(pauseBlockedReason(plan, w, now)).not.toBeNull();
  });
  it("refuses canceled, family, unpaid and overdue plans", () => {
    expect(pauseBlockedReason({ ...plan, status: "CANCELED" }, 2, now)).not.toBeNull();
    expect(pauseBlockedReason({ ...plan, familyGroupId: "g" }, 2, now)).not.toBeNull();
    expect(pauseBlockedReason({ ...plan, installmentsPaid: 0 }, 2, now)).not.toBeNull();
    expect(pauseBlockedReason({ ...plan, nextDueDate: new Date(now.getTime() - DAY) }, 2, now)).not.toBeNull();
  });
  it("allows one pause per 90 days", () => {
    expect(pauseBlockedReason({ ...plan, pausedAt: new Date(now.getTime() - 30 * DAY) }, 2, now)).toMatch(/once every 90 days/);
    expect(pauseBlockedReason({ ...plan, pausedAt: new Date(now.getTime() - (PAUSE_COOLDOWN_DAYS + 1) * DAY) }, 2, now)).toBeNull();
  });
});

describe("pause span", () => {
  it("is whole weeks", () => expect(pauseSpanMs(2)).toBe(14 * DAY));
  it("isPausedNow is true only inside the window", () => {
    const p = { pausedAt: now, pauseUntil: new Date(now.getTime() + 7 * DAY) };
    expect(isPausedNow(p, new Date(now.getTime() + DAY))).toBe(true);
    expect(isPausedNow(p, new Date(now.getTime() + 8 * DAY))).toBe(false);
    expect(isPausedNow({ pausedAt: null, pauseUntil: null }, now)).toBe(false);
  });
});

import { adminPauseBlockedReason, isIndefinitePause } from "@/lib/planPause";

describe("the studio's pause rules", () => {
  const base = { status: "ACTIVE", familyGroupId: null, installmentsPaid: 1, pausedAt: null, pauseUntil: null };
  const now = new Date("2026-10-25T12:00:00Z");
  it("allows a date within a year, or indefinitely", () => {
    expect(adminPauseBlockedReason(base, new Date("2026-12-01T12:00:00Z"), now)).toBeNull();
    expect(adminPauseBlockedReason(base, null, now)).toBeNull();
  });
  it("refuses a date in the past or beyond a year, a family plan, an unpaid first bill and a plan already paused", () => {
    expect(adminPauseBlockedReason(base, new Date("2026-10-24T12:00:00Z"), now)).toMatch(/after today/);
    expect(adminPauseBlockedReason(base, new Date("2028-01-01T12:00:00Z"), now)).toMatch(/within a year/);
    expect(adminPauseBlockedReason({ ...base, familyGroupId: "g" }, null, now)).toMatch(/family/);
    expect(adminPauseBlockedReason({ ...base, installmentsPaid: 0 }, null, now)).toMatch(/first payment/);
    expect(adminPauseBlockedReason({ ...base, pausedAt: new Date("2026-10-20T00:00:00Z"), pauseUntil: new Date("2026-11-20T00:00:00Z") }, null, now)).toMatch(/already paused/);
  });
  it("tells an indefinite pause from a dated one", () => {
    const at = new Date("2026-10-25T00:00:00Z");
    expect(isIndefinitePause({ pausedAt: at, pauseUntil: new Date(at.getTime() + 3650 * 86_400_000) })).toBe(true);
    expect(isIndefinitePause({ pausedAt: at, pauseUntil: new Date(at.getTime() + 30 * 86_400_000) })).toBe(false);
  });
});

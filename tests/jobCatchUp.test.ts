import { describe, expect, it } from "vitest";
import { CATCH_UP_SLOTS, dueCatchUps, latestSlotTime } from "@/lib/jobCatchUp";

const d = (iso: string) => new Date(iso);
const credit = CATCH_UP_SLOTS[0]; // 09:00 UTC

describe("latestSlotTime", () => {
  it("is today's time once it has passed, and yesterday's before it", () => {
    expect(latestSlotTime(credit, d("2026-10-28T18:59:00Z")).toISOString()).toBe("2026-10-28T09:00:00.000Z");
    expect(latestSlotTime(credit, d("2026-10-28T08:00:00Z")).toISOString()).toBe("2026-10-27T09:00:00.000Z");
  });
});

describe("dueCatchUps", () => {
  const lastOk = (credit: string | null, reservations: string | null, summary: string | null, approvals: string | null = "2026-10-28T13:00:05Z", probe: string | null = "2026-10-28T13:00:09Z") => ({
    "credit-expiry": credit ? d(credit) : null,
    "payment-plan-reservations": reservations ? d(reservations) : null,
    "admin-daily-summary": summary ? d(summary) : null,
    "auto-approvals": approvals ? d(approvals) : null,
    "mail-chain-probe": probe ? d(probe) : null,
  });

  it("catches up exactly the three that were missed (the Oct 28 gap)", () => {
    const due = dueCatchUps(d("2026-10-28T18:59:00Z"), lastOk("2026-10-27T09:00:04Z", "2026-10-27T09:30:03Z", "2026-10-27T12:00:02Z"));
    expect(due.map((x) => x.name)).toEqual(["credit-expiry", "payment-plan-reservations", "admin-daily-summary"]);
  });

  it("also catches up the two 13:00 UTC jobs the scheduler missed by five minutes", () => {
    const due = dueCatchUps(d("2026-10-28T19:20:00Z"), lastOk("2026-10-28T09:00:04Z", "2026-10-28T09:30:03Z", "2026-10-28T12:00:02Z", "2026-10-27T13:00:05Z", "2026-10-27T13:00:09Z"));
    expect(due.map((x) => x.name)).toEqual(["auto-approvals", "mail-chain-probe"]);
  });

  it("does nothing for a job that already ran since its slot", () => {
    const due = dueCatchUps(d("2026-10-28T18:59:00Z"), lastOk("2026-10-28T09:00:04Z", "2026-10-28T09:30:03Z", "2026-10-28T12:00:02Z"));
    expect(due).toEqual([]);
  });

  it("leaves the normal scheduler 20 minutes before stepping in", () => {
    const early = dueCatchUps(d("2026-10-28T09:10:00Z"), lastOk("2026-10-27T09:00:04Z", "2026-10-27T09:30:03Z", "2026-10-27T12:00:02Z"));
    expect(early.map((x) => x.name)).toEqual([]);
    const later = dueCatchUps(d("2026-10-28T09:21:00Z"), lastOk("2026-10-27T09:00:04Z", "2026-10-27T09:30:03Z", "2026-10-27T12:00:02Z"));
    expect(later.map((x) => x.name)).toEqual(["credit-expiry"]);
  });

  it("does nothing before a slot's time has come today when yesterday's ran", () => {
    const due = dueCatchUps(d("2026-10-28T08:00:00Z"), lastOk("2026-10-27T09:00:04Z", "2026-10-27T09:30:03Z", "2026-10-27T12:00:02Z"));
    expect(due).toEqual([]);
  });

  it("treats a job that never ran successfully as due", () => {
    const due = dueCatchUps(d("2026-10-28T18:59:00Z"), lastOk(null, "2026-10-28T09:30:03Z", "2026-10-28T12:00:02Z"));
    expect(due.map((x) => x.name)).toEqual(["credit-expiry"]);
  });

  it("is stable: running it again with the new run recorded finds nothing", () => {
    const first = dueCatchUps(d("2026-10-28T19:00:00Z"), lastOk("2026-10-27T09:00:04Z", "2026-10-27T09:30:03Z", "2026-10-27T12:00:02Z"));
    expect(first).toHaveLength(3);
    const second = dueCatchUps(d("2026-10-28T19:10:00Z"), lastOk("2026-10-28T19:00:05Z", "2026-10-28T19:00:20Z", "2026-10-28T19:00:30Z"));
    expect(second).toEqual([]);
  });
});

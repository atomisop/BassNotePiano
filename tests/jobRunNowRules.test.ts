import { describe, expect, it } from "vitest";
import { RUN_NOW_DAILY_REPEAT_HOURS, runNowBlock, runNowLockKey, runNowWaitMs } from "@/lib/jobRunNowRules";

const now = new Date("2026-11-09T18:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

describe("Run now on an automatic task", () => {
  it("runs a stopped task", () => {
    expect(runNowBlock({ name: "practice-reminders", maxSilenceHours: 30, paused: false, lastOkAt: hoursAgo(40), now })).toBeNull();
    expect(runNowBlock({ name: "practice-reminders", maxSilenceHours: 30, paused: false, lastOkAt: null, now })).toBeNull();
  });
  it("runs a frequent task any time: it is built to run every few minutes", () => {
    expect(runNowBlock({ name: "class-reminders", maxSilenceHours: 2, paused: false, lastOkAt: hoursAgo(0.1), now })).toBeNull();
  });
  it("refuses a daily task that already ran fine today, so notices are not sent twice", () => {
    const reason = runNowBlock({ name: "practice-reminders", maxSilenceHours: 30, paused: false, lastOkAt: hoursAgo(RUN_NOW_DAILY_REPEAT_HOURS - 1), now });
    expect(reason).toMatch(/already ran fine/);
    expect(runNowBlock({ name: "practice-reminders", maxSilenceHours: 30, paused: false, lastOkAt: hoursAgo(RUN_NOW_DAILY_REPEAT_HOURS + 1), now })).toBeNull();
  });
  it("lets the backup run again: a second copy only replaces today's file", () => {
    expect(runNowBlock({ name: "db-backup", maxSilenceHours: 30, paused: false, lastOkAt: hoursAgo(1), now })).toBeNull();
  });
  it("refuses a paused task, an unknown one, and keep-warm", () => {
    expect(runNowBlock({ name: "slot-waitlist", maxSilenceHours: 3, paused: true, lastOkAt: null, now })).toMatch(/paused/);
    expect(runNowBlock({ name: "nope", maxSilenceHours: null, paused: false, lastOkAt: null, now })).toMatch(/can't be run/);
    expect(runNowBlock({ name: "keep-warm", maxSilenceHours: 1, paused: false, lastOkAt: null, now })).toMatch(/can't be run/);
  });
  it("waits longest for the backup and keys one lock per task", () => {
    expect(runNowWaitMs("db-backup")).toBeGreaterThan(runNowWaitMs("slot-waitlist"));
    expect(runNowLockKey("db-backup")).not.toBe(runNowLockKey("slot-waitlist"));
  });
});

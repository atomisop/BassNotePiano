import { describe, expect, it, vi } from "vitest";
import { evaluateJob, isStopped } from "@/lib/jobRun";
import {
  ALERT_REPEAT_HOURS,
  RECOVERED_NOTE,
  describeStoppedJob,
  pingMonitor,
  problemKey,
  runWatchdog,
  shouldAlert,
  shouldAnnounceRecovery,
  type WatchdogDeps,
} from "@/lib/jobWatchdog";

const NOW = new Date("2026-10-08T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

describe("evaluateJob", () => {
  const base = { name: "credit-expiry", maxSilenceHours: 30, now: NOW };
  it("is ok when it ran within its window", () => {
    const s = evaluateJob({ ...base, last: { ranAt: hoursAgo(5), ok: true, note: null }, trackingSince: hoursAgo(500) });
    expect(s.state).toBe("ok");
    expect(isStopped(s.state)).toBe(false);
  });
  it("is late once the window passes", () => {
    expect(evaluateJob({ ...base, last: { ranAt: hoursAgo(31), ok: true, note: null }, trackingSince: hoursAgo(500) }).state).toBe("late");
  });
  it("is failed when the last run failed, with the reason", () => {
    const s = evaluateJob({ ...base, last: { ranAt: hoursAgo(1), ok: false, note: "connection refused" }, trackingSince: hoursAgo(500) });
    expect(s).toMatchObject({ state: "failed", note: "connection refused" });
    expect(isStopped(s.state)).toBe(true);
  });
  it("a job that never ran is stopped once the system has been recording longer than its window (it used to count as healthy forever)", () => {
    expect(evaluateJob({ ...base, last: null, trackingSince: hoursAgo(100) }).state).toBe("never");
  });
  it("a job that never ran is only waiting on a fresh system", () => {
    expect(evaluateJob({ ...base, last: null, trackingSince: hoursAgo(5) }).state).toBe("waiting");
    expect(evaluateJob({ ...base, last: null, trackingSince: null }).state).toBe("waiting");
  });
  it("a newly added job gets its whole window from the day it was added", () => {
    expect(evaluateJob({ ...base, maxSilenceHours: 3, last: null, trackingSince: hoursAgo(900), addedAt: hoursAgo(1) }).state).toBe("waiting");
    expect(evaluateJob({ ...base, maxSilenceHours: 3, last: null, trackingSince: hoursAgo(900), addedAt: hoursAgo(4) }).state).toBe("never");
  });
});

describe("watchdog decisions", () => {
  const problems = ["credit-expiry: has not run for over 30 hours"];
  it("alerts on a new problem, not again inside the repeat window, and again after it", () => {
    expect(shouldAlert({ problems, last: null, now: NOW })).toBe(true);
    const last = { note: problemKey(problems), ranAt: hoursAgo(ALERT_REPEAT_HOURS - 1) };
    expect(shouldAlert({ problems, last, now: NOW })).toBe(false);
    expect(shouldAlert({ problems, last: { ...last, ranAt: hoursAgo(ALERT_REPEAT_HOURS + 1) }, now: NOW })).toBe(true);
  });
  it("alerts at once when a different problem appears", () => {
    expect(shouldAlert({ problems: [...problems, "auto-approvals: has never run"], last: { note: problemKey(problems), ranAt: hoursAgo(1) }, now: NOW })).toBe(true);
  });
  it("alerts again if the problem returns after a recovery", () => {
    expect(shouldAlert({ problems, last: { note: RECOVERED_NOTE, ranAt: hoursAgo(1) }, now: NOW })).toBe(true);
  });
  it("never alerts with nothing wrong, and announces recovery once", () => {
    expect(shouldAlert({ problems: [], last: null, now: NOW })).toBe(false);
    expect(shouldAnnounceRecovery({ problems: [], last: { note: problemKey(problems) } })).toBe(true);
    expect(shouldAnnounceRecovery({ problems: [], last: { note: RECOVERED_NOTE } })).toBe(false);
    expect(shouldAnnounceRecovery({ problems: [], last: null })).toBe(false);
    expect(shouldAnnounceRecovery({ problems, last: { note: problemKey(problems) } })).toBe(false);
  });
  it("the same problems in a different order are the same problem", () => {
    expect(problemKey(["b", "a"])).toBe(problemKey(["a", "b"]));
  });
  it("describes each kind of stopped job in plain words", () => {
    const s = { name: "x", lastRanAt: null, note: null, maxSilenceHours: 30 } as const;
    expect(describeStoppedJob({ ...s, state: "failed", note: "boom" })).toContain("failed (boom)");
    expect(describeStoppedJob({ ...s, state: "never" })).toContain("never run");
    expect(describeStoppedJob({ ...s, state: "late" })).toContain("over 30 hours");
  });
});

describe("runWatchdog", () => {
  function fakes(over: Partial<WatchdogDeps> = {}) {
    const calls: string[] = [];
    const deps: WatchdogDeps = {
      findProblems: async () => [],
      getLastAlert: async () => null,
      recordAlert: async (note) => { calls.push(`record:${note}`); },
      sendEmail: async (subject) => { calls.push(`email:${subject}`); },
      ping: async (p) => { calls.push(`ping:${p.length}`); },
      ...over,
    };
    return { deps, calls };
  }
  it("pings first, even when it then fails to email", async () => {
    const { deps, calls } = fakes({ findProblems: async () => ["a: has never run"], sendEmail: async () => { throw new Error("resend down"); } });
    const result = await runWatchdog(deps, NOW);
    expect(calls[0]).toBe("ping:1");
    expect(result.alerted).toBe(false);
    expect(calls.some((c) => c.startsWith("record:"))).toBe(false); // not recorded, so it retries in 30 minutes
  });
  it("emails and records a new problem once", async () => {
    let last: { note: string | null; ranAt: Date } | null = null;
    const { deps, calls } = fakes({
      findProblems: async () => ["a: has never run"],
      getLastAlert: async () => last,
      recordAlert: async (note) => { last = { note, ranAt: NOW }; },
      sendEmail: async (subject) => { calls.push(`email:${subject}`); },
    });
    expect((await runWatchdog(deps, NOW)).alerted).toBe(true);
    expect((await runWatchdog(deps, NOW)).alerted).toBe(false); // the next run, 30 minutes later: no repeat
    expect(calls.filter((c) => c.startsWith("email:"))).toHaveLength(1);
  });
  it("announces a recovery once, then stays quiet", async () => {
    let last: { note: string | null; ranAt: Date } | null = { note: "a: has never run", ranAt: hoursAgo(2) };
    const emails: string[] = [];
    const { deps } = fakes({
      getLastAlert: async () => last,
      recordAlert: async (note) => { last = { note, ranAt: NOW }; },
      sendEmail: async (subject) => { emails.push(subject); },
    });
    expect((await runWatchdog(deps, NOW)).recovered).toBe(true);
    expect((await runWatchdog(deps, NOW)).recovered).toBe(false);
    expect(emails).toEqual(["Scheduled jobs are running again"]);
  });
  it("a healthy system pings OK and sends nothing", async () => {
    const { deps, calls } = fakes();
    expect(await runWatchdog(deps, NOW)).toEqual({ problems: [], alerted: false, recovered: false });
    expect(calls).toEqual(["ping:0"]);
  });
});

describe("pingMonitor", () => {
  it("does nothing without a URL, or with one that is not https", async () => {
    const f = vi.fn();
    await pingMonitor(undefined, [], f as unknown as typeof fetch);
    await pingMonitor("http://insecure.example/abc", [], f as unknown as typeof fetch);
    expect(f).not.toHaveBeenCalled();
  });
  it("pings the plain URL when healthy and /fail with the problems when not", async () => {
    const f = vi.fn().mockResolvedValue({});
    await pingMonitor("https://hc-ping.com/abc/", [], f as unknown as typeof fetch);
    expect(f.mock.calls[0][0]).toBe("https://hc-ping.com/abc/");
    await pingMonitor("https://hc-ping.com/abc/", ["x: stopped"], f as unknown as typeof fetch);
    expect(f.mock.calls[1][0]).toBe("https://hc-ping.com/abc/fail");
    expect(f.mock.calls[1][1].body).toBe("x: stopped");
  });
  it("never throws when the monitor cannot be reached", async () => {
    const f = vi.fn().mockRejectedValue(new Error("network down"));
    await expect(pingMonitor("https://hc-ping.com/abc", [], f as unknown as typeof fetch)).resolves.toBeUndefined();
  });
});

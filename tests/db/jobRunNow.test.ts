import { afterAll, describe, expect, it } from "vitest";
import { runJobNow, runnableJobNames } from "@/lib/jobRunNow";
import { JOB_MAX_SILENCE_HOURS } from "@/lib/jobRun";
import { setJobPaused } from "@/lib/jobPause";
import { runNowLockKey } from "@/lib/jobRunNowRules";
import { prisma } from "./helpers";

const startedAt = new Date();
const madeRunIds: string[] = [];

afterAll(async () => {
  await setJobPaused("slot-waitlist", false, "test");
  await prisma.appSetting.deleteMany({ where: { key: { in: Object.keys(JOB_MAX_SILENCE_HOURS).map(runNowLockKey) } } });
  await prisma.jobRun.deleteMany({ where: { id: { in: madeRunIds } } });
  // The real run below records itself like a scheduled run.
  await prisma.jobRun.deleteMany({ where: { name: "slot-waitlist", ranAt: { gte: startedAt } } });
});

describe("Run now on an automatic task", () => {
  it("covers every watched task", () => {
    expect(runnableJobNames().sort()).toEqual(Object.keys(JOB_MAX_SILENCE_HOURS).sort());
  });

  it("runs the task's own scheduled run, which records itself like a scheduled run", async () => {
    const result = await runJobNow("slot-waitlist");
    expect(result).toEqual({ ok: true, outcome: "done" });
    const row = await prisma.jobRun.findFirst({ where: { name: "slot-waitlist", ranAt: { gte: startedAt } } });
    expect(row?.ok).toBe(true);
    expect(await prisma.appSetting.findUnique({ where: { key: runNowLockKey("slot-waitlist") } })).toBeNull();
  });

  it("runs one at a time: a second press while it runs is refused, and the lock goes when it ends", async () => {
    let finish: () => void = () => undefined;
    const slow = () => new Promise<void>((resolve) => (finish = resolve));
    const first = runJobNow("class-reminders", { run: slow, waitMs: 5_000 });
    await new Promise((r) => setTimeout(r, 50));
    expect(await runJobNow("class-reminders", { run: async () => undefined })).toMatchObject({ ok: false, error: expect.stringMatching(/already running/) });
    finish();
    expect(await first).toEqual({ ok: true, outcome: "done" });
    expect(await prisma.appSetting.findUnique({ where: { key: runNowLockKey("class-reminders") } })).toBeNull();
  });

  it("stops waiting after its limit and frees the lock when the run ends", async () => {
    let finish: () => void = () => undefined;
    let ended = false;
    const run = () => new Promise<void>((resolve) => (finish = resolve)).then(() => void (ended = true));
    expect(await runJobNow("attendance-auto-charge", { run, waitMs: 20 })).toEqual({ ok: true, outcome: "still-running" });
    expect(await prisma.appSetting.findUnique({ where: { key: runNowLockKey("attendance-auto-charge") } })).not.toBeNull();
    finish();
    for (let i = 0; i < 50 && (await prisma.appSetting.findUnique({ where: { key: runNowLockKey("attendance-auto-charge") } })); i++) await new Promise((r) => setTimeout(r, 20));
    expect(ended).toBe(true);
    expect(await prisma.appSetting.findUnique({ where: { key: runNowLockKey("attendance-auto-charge") } })).toBeNull();
  });

  it("says when the run failed", async () => {
    const result = await runJobNow("job-watchdog", { run: async () => Promise.reject(new Error("database asleep")) });
    expect(result).toEqual({ ok: false, error: "database asleep", failed: true });
  });

  it("refuses a daily task that already ran fine today, and a paused one", async () => {
    const recent = await prisma.jobRun.create({ data: { name: "practice-reminders", ok: true, ranAt: new Date(Date.now() - 3_600_000) } });
    madeRunIds.push(recent.id);
    let ran = false;
    const result = await runJobNow("practice-reminders", { run: async () => void (ran = true) });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/already ran fine/) });
    expect(ran).toBe(false);

    await setJobPaused("slot-waitlist", true, "test");
    expect(await runJobNow("slot-waitlist", { run: async () => void (ran = true) })).toMatchObject({ ok: false, error: expect.stringMatching(/paused/) });
    expect(ran).toBe(false);
    await setJobPaused("slot-waitlist", false, "test");
  });

  it("refuses a task that is not watched", async () => {
    expect(await runJobNow("keep-warm")).toMatchObject({ ok: false });
  });
});

import { prisma } from "@/lib/prisma";
import { JOB_MAX_SILENCE_HOURS } from "@/lib/jobRun";
import { isJobPaused } from "@/lib/jobPause";
import { RUN_NOW_LOCK_STALE_MS, runNowBlock, runNowLockKey, runNowWaitMs } from "@/lib/jobRunNowRules";

// "Run now" on System > Automatic tasks (owner only, see jobActions.ts). It calls the very function each schedule calls: the run
// exported by the job's file in netlify/functions, which wraps its work in runJob, so the run is recorded like a scheduled one and a
// paused task still does nothing. Loaded only when pressed, so the pages never carry the jobs' code.

type Run = () => Promise<unknown>;

const RUNNERS: Record<string, () => Promise<Run>> = {
  "credit-expiry": async () => (await import("../../netlify/functions/credit-expiry")).runCreditExpiry,
  "payment-plan-installments": async () => (await import("../../netlify/functions/payment-plan-installments")).runPaymentPlanInstallments,
  "payment-plan-reservations": async () => (await import("../../netlify/functions/payment-plan-reservations")).runPaymentPlanReservations,
  "practice-reminders": async () => (await import("../../netlify/functions/practice-reminders")).runPracticeReminders,
  "admin-daily-summary": async () => (await import("../../netlify/functions/admin-daily-summary")).runAdminDailySummary,
  "class-reminders": async () => (await import("../../netlify/functions/class-reminders")).runClassReminders,
  "attendance-auto-charge": async () => (await import("../../netlify/functions/attendance-auto-charge")).runAttendanceAutoChargeJob,
  "auto-approvals": async () => (await import("../../netlify/functions/auto-approvals")).runAutoApprovals,
  "discord-class-channels": async () => (await import("../../netlify/functions/discord-class-channels")).runDiscordClassChannels,
  "mail-chain-probe": async () => (await import("../../netlify/functions/mail-chain-probe")).runMailChainProbe,
  "db-backup": async () => (await import("../../netlify/functions/db-backup")).runDbBackup,
  "slot-waitlist": async () => (await import("../../netlify/functions/slot-waitlist")).runSlotWaitlist,
  "job-watchdog": async () => (await import("../../netlify/functions/job-watchdog")).runJobWatchdog,
  "job-catch-up": async () => (await import("../../netlify/functions/job-catch-up")).runJobCatchUp,
};

/** The tasks that have a Run now (every watched task). */
export function runnableJobNames(): string[] {
  return Object.keys(RUNNERS).filter((name) => Object.prototype.hasOwnProperty.call(JOB_MAX_SILENCE_HOURS, name));
}

export type RunNowResult =
  | { ok: true; outcome: "done" }
  /** Still going when the wait ran out; it records itself when it ends. */
  | { ok: true; outcome: "still-running" }
  | { ok: false; error: string; failed?: boolean };

/**
 * Runs one task now, once: refused while it is paused, while a run from here is still going, or (for a daily task) when it already
 * ran fine today. Waits up to the task's limit for the run to end; a longer one keeps going and frees the lock when it ends.
 * `run` replaces the task's real run in tests.
 */
export async function runJobNow(name: string, options: { now?: Date; waitMs?: number; run?: Run } = {}): Promise<RunNowResult> {
  const now = options.now ?? new Date();
  const known = Object.prototype.hasOwnProperty.call(JOB_MAX_SILENCE_HOURS, name) && Object.prototype.hasOwnProperty.call(RUNNERS, name);
  const [paused, lastOk] = known
    ? await Promise.all([
        isJobPaused(name).catch(() => false),
        prisma.jobRun.findFirst({ where: { name, ok: true }, orderBy: { ranAt: "desc" }, select: { ranAt: true } }),
      ])
    : [false, null];
  const blocked = runNowBlock({ name, maxSilenceHours: known ? JOB_MAX_SILENCE_HOURS[name] : null, paused, lastOkAt: lastOk?.ranAt ?? null, now });
  if (blocked) return { ok: false, error: blocked };

  // One at a time: the lock row can only be made once. A lock left by a run that died long ago is cleared first.
  const key = runNowLockKey(name);
  await prisma.appSetting.deleteMany({ where: { key, updatedAt: { lt: new Date(now.getTime() - RUN_NOW_LOCK_STALE_MS) } } });
  const claimed = await prisma.appSetting
    .create({ data: { key, value: now.toISOString() } })
    .then(() => true)
    .catch(() => false);
  if (!claimed) return { ok: false, error: "It is already running. Give it a minute." };

  const run = options.run ?? (await RUNNERS[name]().catch(() => null));
  if (!run) {
    await prisma.appSetting.deleteMany({ where: { key } });
    return { ok: false, error: "Could not load that task." };
  }
  const work = Promise.resolve()
    .then(run)
    .then(
      () => ({ kind: "done" as const }),
      (err: unknown) => ({ kind: "failed" as const, message: err instanceof Error ? err.message.slice(0, 300) : "It failed." }),
    )
    .finally(() => prisma.appSetting.deleteMany({ where: { key } }).catch(() => undefined));

  let timer: ReturnType<typeof setTimeout> | undefined;
  const waited = new Promise<{ kind: "waiting" }>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "waiting" }), options.waitMs ?? runNowWaitMs(name));
  });
  const result = await Promise.race([work, waited]);
  clearTimeout(timer);
  if (result.kind === "done") return { ok: true, outcome: "done" };
  if (result.kind === "waiting") return { ok: true, outcome: "still-running" };
  return { ok: false, error: result.message, failed: true };
}

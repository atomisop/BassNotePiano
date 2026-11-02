import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { isJobPaused, pausedJobNames } from "@/lib/jobPause";

/** How long a job that did nothing may go without a new run row: the watchdog windows are all 2 hours or more. */
const QUIET_RUN_MS = 15 * 60 * 1000;

/**
 * Runs one scheduled job and records that it ran, and whether it worked, so a job that stops shows up.
 *
 * `quietWhen`: a job that runs every minute or two (the Discord one) wrote a row on every run, 1,440 rows a day of "nothing to
 * do" (2026-11-02 audit). When it says the run was idle, a row is written only if the last one is older than QUIET_RUN_MS,
 * which keeps the watchdog honest and the table small. A failure is always recorded.
 */
export async function runJob<T>(name: string, fn: () => Promise<T>, options?: { quietWhen?: (result: T) => boolean }): Promise<T> {
  // A job the owner paused does nothing and records nothing (so it never looks like a failure). If the pause cannot be read, it runs.
  if (await isJobPaused(name).catch(() => false)) {
    console.log(`${name} is paused: skipped.`);
    return { statusCode: 200, body: "paused" } as unknown as T;
  }
  try {
    const result = await fn();
    if (options?.quietWhen?.(result)) {
      const last = await prisma.jobRun.findFirst({ where: { name }, orderBy: { ranAt: "desc" }, select: { ranAt: true } }).catch(() => null);
      if (last && Date.now() - last.ranAt.getTime() < QUIET_RUN_MS) return result;
    }
    await prisma.jobRun.create({ data: { name, ok: true } }).catch(() => undefined);
    return result;
  } catch (err) {
    await prisma.jobRun
      .create({ data: { name, ok: false, note: err instanceof Error ? err.message.slice(0, 300) : "failed" } })
      .catch(() => undefined);
    throw err;
  }
}

/** How long each scheduled job is allowed to go without running before it counts as stopped, in hours. */
export const JOB_MAX_SILENCE_HOURS: Record<string, number> = {
  "credit-expiry": 30,
  "payment-plan-installments": 30,
  "payment-plan-reservations": 30,
  "practice-reminders": 30,
  "admin-daily-summary": 30,
  "class-reminders": 2,
  "attendance-auto-charge": 3,
  "auto-approvals": 30,
  "discord-class-channels": 2,
  "mail-chain-probe": 30,
  "db-backup": 30,
  "slot-waitlist": 3,
  // The watchdog itself runs every 30 minutes; the outside monitor is what notices if it stops.
  "job-watchdog": 3,
  "job-catch-up": 3,
};

/**
 * Jobs added after the rest. A job that has never run only counts as stopped
 * once its window has passed since this moment, so shipping a new job does
 * not raise a false alarm before its first run.
 */
export const JOB_ADDED_AT: Record<string, string> = {
  "job-watchdog": "2026-10-08T00:00:00Z",
  "mail-chain-probe": "2026-10-09T00:00:00Z",
  "db-backup": "2026-10-09T00:00:00Z",
  "attendance-auto-charge": "2026-10-13T00:00:00Z",
  "slot-waitlist": "2026-10-22T00:00:00Z",
  "job-catch-up": "2026-10-28T23:00:00Z",
};

export type JobState = "ok" | "waiting" | "failed" | "late" | "never" | "paused";

export interface JobStatus {
  name: string;
  state: JobState;
  lastRanAt: Date | null;
  /** The error from the last run when it failed. */
  note: string | null;
  maxSilenceHours: number;
}

/** Stopped means failed, late, or never run although the system has been recording for longer than the window. */
export function isStopped(state: JobState): boolean {
  return state === "failed" || state === "late" || state === "never";
}

/**
 * Pure, so it is tested. `trackingSince` is when the oldest job run was
 * recorded: a job with no run at all is only "never" once the system has been
 * recording for longer than that job's window (and the job itself existed).
 */
export function evaluateJob(input: {
  name: string;
  maxSilenceHours: number;
  last: { ranAt: Date; ok: boolean; note: string | null } | null;
  trackingSince: Date | null;
  addedAt?: Date | null;
  now: Date;
  /** The owner paused this job: it is not late or failed, it is stopped on purpose. */
  paused?: boolean;
}): JobStatus {
  const { name, maxSilenceHours, last, trackingSince, addedAt, now, paused } = input;
  const windowMs = maxSilenceHours * 3_600_000;
  if (paused) return { name, state: "paused", lastRanAt: last?.ranAt ?? null, note: null, maxSilenceHours };
  if (!last) {
    const clockStart = Math.max(trackingSince?.getTime() ?? Infinity, addedAt?.getTime() ?? 0);
    const state: JobState = Number.isFinite(clockStart) && now.getTime() - clockStart > windowMs ? "never" : "waiting";
    return { name, state, lastRanAt: null, note: null, maxSilenceHours };
  }
  const state: JobState = !last.ok ? "failed" : now.getTime() - last.ranAt.getTime() > windowMs ? "late" : "ok";
  return { name, state, lastRanAt: last.ranAt, note: last.ok ? null : last.note, maxSilenceHours };
}

export async function getJobStatuses(now = new Date()): Promise<JobStatus[]> {
  const names = Object.keys(JOB_MAX_SILENCE_HOURS);
  // Each job's latest run in ONE query (DISTINCT ON, served by the (name, ranAt) index) instead of one query per job: this runs on
  // every admin page load, and 14 round trips to the database added up (2026-10-31 speed pass).
  const [oldest, paused, latest] = await Promise.all([
    prisma.jobRun.findFirst({ orderBy: { ranAt: "asc" }, select: { ranAt: true } }),
    pausedJobNames().catch(() => new Set<string>()),
    prisma.$queryRaw<{ name: string; ranAt: Date; ok: boolean; note: string | null }[]>`
      SELECT DISTINCT ON ("name") "name", "ranAt", "ok", "note"
      FROM "JobRun"
      WHERE "name" = ANY(${names})
      ORDER BY "name", "ranAt" DESC`,
  ]);
  const lastByName = new Map(latest.map((r) => [r.name, { ranAt: r.ranAt, ok: r.ok, note: r.note }]));
  return Object.entries(JOB_MAX_SILENCE_HOURS).map(([name, maxSilenceHours]) => {
    const added = JOB_ADDED_AT[name];
    return evaluateJob({ name, maxSilenceHours, last: lastByName.get(name) ?? null, trackingSince: oldest?.ranAt ?? null, addedAt: added ? new Date(added) : null, now, paused: paused.has(name) });
  });
}

/** The stopped jobs, worked out once per page load (the admin side cards and "needs you" both ask while one page renders). */
export const findStoppedJobsOnce = cache(() => findStoppedJobs());

/** Names of the jobs that have not run (or last failed) within their allowed window, or never ran at all. */
export async function findStoppedJobs(now = new Date()): Promise<string[]> {
  return (await getJobStatuses(now)).filter((s) => isStopped(s.state)).map((s) => s.name);
}

/** Run records older than this are removed by the daily job: the Discord check alone writes one a minute. */
export const JOB_RUN_KEEP_DAYS = 30;

export async function purgeOldJobRuns(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.jobRun.deleteMany({ where: { ranAt: { lt: new Date(now.getTime() - JOB_RUN_KEEP_DAYS * 86_400_000) } } });
  return count;
}

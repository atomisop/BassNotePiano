import { prisma } from "@/lib/prisma";

/** Runs one scheduled job and records that it ran, and whether it worked, so a job that stops shows up. */
export async function runJob<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    const result = await fn();
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
};

export type JobState = "ok" | "waiting" | "failed" | "late" | "never";

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
}): JobStatus {
  const { name, maxSilenceHours, last, trackingSince, addedAt, now } = input;
  const windowMs = maxSilenceHours * 3_600_000;
  if (!last) {
    const clockStart = Math.max(trackingSince?.getTime() ?? Infinity, addedAt?.getTime() ?? 0);
    const state: JobState = Number.isFinite(clockStart) && now.getTime() - clockStart > windowMs ? "never" : "waiting";
    return { name, state, lastRanAt: null, note: null, maxSilenceHours };
  }
  const state: JobState = !last.ok ? "failed" : now.getTime() - last.ranAt.getTime() > windowMs ? "late" : "ok";
  return { name, state, lastRanAt: last.ranAt, note: last.ok ? null : last.note, maxSilenceHours };
}

export async function getJobStatuses(now = new Date()): Promise<JobStatus[]> {
  const oldest = await prisma.jobRun.findFirst({ orderBy: { ranAt: "asc" }, select: { ranAt: true } });
  return Promise.all(
    Object.entries(JOB_MAX_SILENCE_HOURS).map(async ([name, maxSilenceHours]) => {
      const last = await prisma.jobRun.findFirst({ where: { name }, orderBy: { ranAt: "desc" }, select: { ranAt: true, ok: true, note: true } });
      const added = JOB_ADDED_AT[name];
      return evaluateJob({ name, maxSilenceHours, last, trackingSince: oldest?.ranAt ?? null, addedAt: added ? new Date(added) : null, now });
    }),
  );
}

/** Names of the jobs that have not run (or last failed) within their allowed window, or never ran at all. */
export async function findStoppedJobs(now = new Date()): Promise<string[]> {
  return (await getJobStatuses(now)).filter((s) => isStopped(s.state)).map((s) => s.name);
}

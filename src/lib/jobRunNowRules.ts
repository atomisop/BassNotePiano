// Rules for the owner's "Run now" on System > Automatic tasks. Pure, so they are tested without a database.
//
// A stopped task used to wait for its next turn (an hour, or a whole day) or for someone to press Run in Netlify. Run now starts the
// same run the schedule starts (each job's own run function, wrapped in runJob, so it is recorded like a scheduled run). These rules
// decide when a press is refused, how long the screen waits for it, and how the one-at-a-time lock is named.

/** keep-warm only asks for a page and is not a watched task; it has no Run now. */
export const RUN_NOW_SKIPPED = new Set(["keep-warm"]);

/** How long the screen waits for a run. A server request cannot wait forever; a run that takes longer keeps going and records itself. */
export const RUN_NOW_WAIT_MS = 15_000;
/** The backup copies every table, so it gets the longest wait. */
export const RUN_NOW_WAIT_MS_BY_JOB: Record<string, number> = { "db-backup": 25_000 };

export function runNowWaitMs(name: string): number {
  return RUN_NOW_WAIT_MS_BY_JOB[name] ?? RUN_NOW_WAIT_MS;
}

/** One run at a time per task: a row in AppSetting under this key, made before the run and removed after it. */
export function runNowLockKey(name: string): string {
  return `job-run-now:${name}`;
}

/** A lock older than this belongs to a run that died before it could remove it, so the next press may take it over. */
export const RUN_NOW_LOCK_STALE_MS = 10 * 60_000;

/**
 * Daily tasks send notices or bills. Once one has run fine within this many hours it is not stopped, and running it again could
 * send the same practice reminder or bill notice twice. The backup is the exception: a second copy only replaces today's file.
 */
export const RUN_NOW_DAILY_REPEAT_HOURS = 24; // a full cycle: pressed earlier, the next scheduled run would repeat the same exact-day notices
const REPEATABLE_DAILY = new Set(["db-backup"]);

const whenEt = (d: Date) => d.toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });

/** Why a press of Run now is refused, or null when it may run. */
export function runNowBlock(input: { name: string; maxSilenceHours: number | null; paused: boolean; lastOkAt: Date | null; now: Date }): string | null {
  const { name, maxSilenceHours, paused, lastOkAt, now } = input;
  if (maxSilenceHours === null || RUN_NOW_SKIPPED.has(name)) return "That task can't be run from here.";
  if (paused) return "It is paused. Resume it first.";
  const daily = maxSilenceHours >= 24;
  if (daily && !REPEATABLE_DAILY.has(name) && lastOkAt && now.getTime() - lastOkAt.getTime() < RUN_NOW_DAILY_REPEAT_HOURS * 3_600_000) {
    return `It already ran fine at ${whenEt(lastOkAt)} ET. Running it again today could send the same notices twice.`;
  }
  return null;
}

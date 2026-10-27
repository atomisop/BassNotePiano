import { isStopped, type JobStatus } from "@/lib/jobRun";

// The watchdog: every 30 minutes a scheduled function looks for scheduled jobs
// that stopped, tells the owner by email, and pings an outside monitor. It
// does not live inside the daily summary email, because that is one of the
// jobs it watches. The outside monitor (healthchecks.io, free) is what
// notices if the watchdog itself, the database, or the whole site stops.
// Pure decision logic with injected dependencies, so it is tested.

const HOUR_MS = 3_600_000;
/** The same problem is emailed again no sooner than this. */
export const ALERT_REPEAT_HOURS = 12;
/** Stored as the note of the last alert row once everything was fine again. */
export const RECOVERED_NOTE = "recovered";

/** One readable line for a stopped job. */
export function describeStoppedJob(status: JobStatus): string {
  if (status.state === "failed") return `${status.name}: the last run failed${status.note ? ` (${status.note})` : ""}`;
  if (status.state === "never") return `${status.name}: has never run`;
  return `${status.name}: has not run for over ${status.maxSilenceHours} hours`;
}

export function problemsFromStatuses(statuses: JobStatus[]): string[] {
  return statuses.filter((s) => isStopped(s.state)).map(describeStoppedJob);
}

/** Same problems means the same key, whatever order they are listed in. */
export function problemKey(problems: string[]): string {
  return [...problems].sort().join("|");
}

export function shouldAlert(input: { problems: string[]; last: { note: string | null; ranAt: Date } | null; now: Date }): boolean {
  const { problems, last, now } = input;
  if (problems.length === 0) return false;
  if (!last || last.note === RECOVERED_NOTE) return true;
  if (last.note !== problemKey(problems)) return true;
  return now.getTime() - last.ranAt.getTime() > ALERT_REPEAT_HOURS * HOUR_MS;
}

export function shouldAnnounceRecovery(input: { problems: string[]; last: { note: string | null } | null }): boolean {
  return input.problems.length === 0 && input.last !== null && input.last.note !== RECOVERED_NOTE;
}

export interface WatchdogDeps {
  /** Every problem found right now, one line each. */
  findProblems: () => Promise<string[]>;
  getLastAlert: () => Promise<{ note: string | null; ranAt: Date } | null>;
  recordAlert: (note: string) => Promise<void>;
  sendEmail: (subject: string, body: string) => Promise<void>;
  /** Tell the outside monitor the watchdog is alive, and whether anything is wrong. Never throws. */
  ping: (problems: string[]) => Promise<void>;
}

export async function runWatchdog(deps: WatchdogDeps, now = new Date()): Promise<{ problems: string[]; alerted: boolean; recovered: boolean }> {
  const problems = await deps.findProblems();
  // First, so a broken email service can never stop the outside monitor hearing from us.
  await deps.ping(problems);

  const last = await deps.getLastAlert();
  let alerted = false;
  let recovered = false;

  if (shouldAlert({ problems, last, now })) {
    try {
      await deps.sendEmail(
        problems.length === 1 ? "Something needs attention" : `${problems.length} things need attention`,
        `${problems.map((x) => `- ${x}`).join("\n")}\n\nThese are checked automatically in the background. Open Admin > Overview to see each one, or Netlify > Logs > Functions for the error.`,
      );
      await deps.recordAlert(problemKey(problems));
      alerted = true;
    } catch (err) {
      // Not recorded, so the next run (30 minutes later) tries again.
      console.error("Watchdog could not send its alert email:", err);
    }
  } else if (shouldAnnounceRecovery({ problems, last })) {
    try {
      await deps.sendEmail("Everything is running again", "Every scheduled job has run within its window again, and the mail and payment email checks are passing.");
      await deps.recordAlert(RECOVERED_NOTE);
      recovered = true;
    } catch (err) {
      console.error("Watchdog could not send its recovery email:", err);
    }
  }
  return { problems, alerted, recovered };
}

/** Pings healthchecks.io (or any monitor with the same shape). `/fail` is appended when something is wrong. Never throws. */
export async function pingMonitor(url: string | undefined, problems: string[], fetchImpl: typeof fetch = fetch): Promise<void> {
  if (!url || !/^https:\/\//.test(url)) return;
  try {
    await fetchImpl(problems.length > 0 ? `${url.replace(/\/+$/, "")}/fail` : url, {
      method: "POST",
      body: problems.join("\n").slice(0, 1000),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error("Watchdog could not reach the outside monitor:", err);
  }
}

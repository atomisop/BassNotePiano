"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { logAudit } from "@/lib/audit";
import { JOB_MAX_SILENCE_HOURS, getJobStatuses, type JobState } from "@/lib/jobRun";
import { runProbes } from "@/lib/jobCheckNow";
import { jobVerdict, type JobVerdict } from "@/lib/jobCheckRules";
import { setJobPaused } from "@/lib/jobPause";
import { runJobNow } from "@/lib/jobRunNow";

/** Owner only: stops one automatic task from running until it is resumed (its scheduled run still arrives and does nothing). */
export async function setJobPausedAction(name: string, paused: boolean): Promise<{ ok: boolean; error: string | null }> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  if (!isOwnerEmail(session.user.email)) return { ok: false, error: "Only the owner can pause an automatic task." };
  if (!Object.prototype.hasOwnProperty.call(JOB_MAX_SILENCE_HOURS, name)) return { ok: false, error: "That task does not exist." };
  await setJobPaused(name, paused, session.user.email ?? "owner");
  await logAudit({ actorId: session.user.id, actorEmail: session.user.email, action: paused ? "job.pause" : "job.resume", targetType: "Job", targetId: name, detail: name });
  revalidatePath("/admin");
  return { ok: true, error: null };
}

/**
 * Owner only: "Run now" on one automatic task. Runs the same run function its schedule calls (recorded by runJob like a scheduled run),
 * one at a time per task, waiting a limited time for it (src/lib/jobRunNow.ts). Audited as job.run-now with how it ended.
 */
export async function runJobNowAction(name: string): Promise<{ ok: boolean; outcome: "done" | "still-running" | null; error: string | null }> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin/security");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  if (!isOwnerEmail(session.user.email)) return { ok: false, outcome: null, error: "Only the owner can run an automatic task." };
  if (typeof name !== "string" || !Object.prototype.hasOwnProperty.call(JOB_MAX_SILENCE_HOURS, name)) return { ok: false, outcome: null, error: "That task does not exist." };
  const result = await runJobNow(name);
  // A refusal (paused, already running, already ran today) changed nothing, so only a real run is logged.
  if (result.ok || result.failed) {
    const detail = result.ok ? (result.outcome === "done" ? `${name}: finished` : `${name}: still running when the wait ended`) : `${name}: failed, ${result.error}`;
    await logAudit({ actorId: session.user.id, actorEmail: session.user.email, action: "job.run-now", targetType: "Job", targetId: name, detail });
  }
  revalidatePath("/admin/security");
  revalidatePath("/admin");
  return result.ok ? { ok: true, outcome: result.outcome, error: null } : { ok: false, outcome: null, error: result.error };
}

/**
 * Owner only: the Refresh on the automatic tasks list. Tests, live and read only, everything the tasks depend on (src/lib/jobCheckNow.ts)
 * and answers with each task's verdict plus its freshly read recorded state. No task is run, and nothing is written.
 */
export async function checkJobsAction(): Promise<{
  ok: boolean;
  error: string | null;
  jobs?: Record<string, { verdict: JobVerdict; state: JobState; lastRanAt: string | null; note: string | null }>;
}> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  if (!isOwnerEmail(session.user.email)) return { ok: false, error: "Only the owner can check the automatic tasks." };
  const [results, statuses] = await Promise.all([runProbes(), getJobStatuses()]);
  const jobs: NonNullable<Awaited<ReturnType<typeof checkJobsAction>>["jobs"]> = {};
  for (const s of statuses) {
    jobs[s.name] = { verdict: jobVerdict(s.name, results), state: s.state, lastRanAt: s.lastRanAt ? s.lastRanAt.toISOString() : null, note: s.note };
  }
  return { ok: true, error: null, jobs };
}

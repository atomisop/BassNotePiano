"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { logAudit } from "@/lib/audit";
import { JOB_MAX_SILENCE_HOURS } from "@/lib/jobRun";
import { setJobPaused } from "@/lib/jobPause";

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

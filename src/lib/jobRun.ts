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
};

/** Jobs that have not run (or last failed) within their allowed window. */
export async function findStoppedJobs(now = new Date()): Promise<string[]> {
  const stopped: string[] = [];
  for (const [name, hours] of Object.entries(JOB_MAX_SILENCE_HOURS)) {
    const last = await prisma.jobRun.findFirst({ where: { name }, orderBy: { ranAt: "desc" }, select: { ranAt: true, ok: true } });
    // Never recorded yet counts as fine for a day, so a fresh deploy does not alarm.
    if (!last) continue;
    if (!last.ok || now.getTime() - last.ranAt.getTime() > hours * 3_600_000) stopped.push(name);
  }
  return stopped;
}

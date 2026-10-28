import { prisma } from "@/lib/prisma";
import { pausedJobNames } from "@/lib/jobPause";

// A daily job that Netlify did not run (a gap in its scheduler, a failed deploy window) used to stay red until the next day's
// run. This runs it as soon as the scheduler is back. It is only for jobs that are safe to run late: each one's own comment says a
// missed run catches up on the next one (existence-based or date-based), so running it a few hours late does the same work.

export interface DailySlot {
  name: string;
  hourUtc: number;
  minuteUtc: number;
}

/** In the order they run each day, so a job that depends on an earlier one (reservations after credit expiry) keeps that order. */
export const CATCH_UP_SLOTS: DailySlot[] = [
  { name: "credit-expiry", hourUtc: 9, minuteUtc: 0 },
  { name: "payment-plan-reservations", hourUtc: 9, minuteUtc: 30 },
  { name: "admin-daily-summary", hourUtc: 12, minuteUtc: 0 },
  // Both safe late: auto-approvals acts only on what is ready now (and nothing while the owner's switches are off); the probe sends one test email.
  { name: "auto-approvals", hourUtc: 13, minuteUtc: 0 },
  { name: "mail-chain-probe", hourUtc: 13, minuteUtc: 0 },
];

/** The normal scheduler gets this long to run a job before the catch-up steps in, so the two never run the same job together. */
export const CATCH_UP_GRACE_MINUTES = 20;

/** The most recent time this slot was due: today's, or yesterday's if today's has not come yet. */
export function latestSlotTime(slot: DailySlot, now: Date): Date {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), slot.hourUtc, slot.minuteUtc);
  return new Date(today <= now.getTime() ? today : today - 86_400_000);
}

/** Pure, so it is tested: which slots were due, are past their grace, and have no successful run since they were due. */
export function dueCatchUps(now: Date, lastOk: Record<string, Date | null>, slots: DailySlot[] = CATCH_UP_SLOTS): { name: string; slot: Date }[] {
  const due: { name: string; slot: Date }[] = [];
  for (const slot of slots) {
    const scheduled = latestSlotTime(slot, now);
    if (now.getTime() - scheduled.getTime() < CATCH_UP_GRACE_MINUTES * 60_000) continue;
    const last = lastOk[slot.name];
    if (last && last.getTime() >= scheduled.getTime()) continue;
    due.push({ name: slot.name, slot: scheduled });
  }
  return due;
}

/**
 * Runs each missed slot once. A slot is claimed first (a row in AppSetting keyed by job and slot time, which can only be created once),
 * so two overlapping catch-ups, or a retry, cannot run the same missed slot twice. If the late run fails the claim stays, the failure is
 * recorded by runJob and reaches the owner through the watchdog, and it is not hammered every ten minutes.
 */
export async function runCatchUps(
  runners: Record<string, () => Promise<unknown>>,
  now = new Date(),
): Promise<string[]> {
  const lastOk: Record<string, Date | null> = {};
  for (const slot of CATCH_UP_SLOTS) {
    const row = await prisma.jobRun.findFirst({ where: { name: slot.name, ok: true }, orderBy: { ranAt: "desc" }, select: { ranAt: true } });
    lastOk[slot.name] = row?.ranAt ?? null;
  }
  const ran: string[] = [];
  // A job the owner paused stays paused: never run it late.
  const paused = await pausedJobNames().catch(() => new Set<string>());
  for (const { name, slot } of dueCatchUps(now, lastOk)) {
    if (paused.has(name)) continue;
    const run = runners[name];
    if (!run) continue;
    const claimed = await prisma.appSetting
      .create({ data: { key: `catch-up:${name}:${slot.toISOString()}`, value: now.toISOString() } })
      .then(() => true)
      .catch(() => false);
    if (!claimed) continue;
    try {
      await run();
      ran.push(name);
    } catch (err) {
      console.error(`Catch-up of ${name} failed:`, err);
    }
  }
  return ran;
}

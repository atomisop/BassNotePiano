/** Pure rules for pausing a payment plan (the database work is `pausePaymentPlan` in paymentPlans.ts). */
export const PAUSE_MAX_WEEKS = 4;
export const PAUSE_COOLDOWN_DAYS = 90;
export const PAUSE_REASON = "Plan paused";
const DAY = 86_400_000;

export interface PausablePlan {
  status: string;
  familyGroupId: string | null;
  installmentsPaid: number;
  nextDueDate: Date;
  pausedAt: Date | null;
}

/** Why this plan cannot be paused now, in plain words, or null when it can. */
export function pauseBlockedReason(plan: PausablePlan, weeks: number, now: Date): string | null {
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > PAUSE_MAX_WEEKS) return `Pick between 1 and ${PAUSE_MAX_WEEKS} weeks.`;
  if (plan.status !== "ACTIVE") return "Only a plan that is running can be paused.";
  if (plan.familyGroupId) return "A family plan can't be paused here. Message support and we will sort it out.";
  if (plan.installmentsPaid < 1) return "Pay for your first month before pausing.";
  if (plan.nextDueDate.getTime() <= now.getTime()) return "Your next payment is due. Pay it first, then you can pause.";
  if (plan.pausedAt && now.getTime() - plan.pausedAt.getTime() < PAUSE_COOLDOWN_DAYS * DAY) {
    const next = new Date(plan.pausedAt.getTime() + PAUSE_COOLDOWN_DAYS * DAY);
    return `You can pause once every ${PAUSE_COOLDOWN_DAYS} days. The next pause opens on ${next.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/New_York" })}.`;
  }
  return null;
}

/** The pause runs exactly `weeks` weeks from now; the due date and credit expiry move by the same span. */
export function pauseSpanMs(weeks: number): number {
  return weeks * 7 * DAY;
}

export function isPausedNow(plan: { pausedAt: Date | null; pauseUntil: Date | null }, now: Date): boolean {
  return Boolean(plan.pausedAt && plan.pauseUntil && plan.pausedAt.getTime() <= now.getTime() && now.getTime() < plan.pauseUntil.getTime());
}

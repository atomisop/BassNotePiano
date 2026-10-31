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
  pauseUntil?: Date | null;
}

/** Why this plan cannot be paused now, in plain words, or null when it can. */
export function pauseBlockedReason(plan: PausablePlan, weeks: number, now: Date): string | null {
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > PAUSE_MAX_WEEKS) return `Pick between 1 and ${PAUSE_MAX_WEEKS} weeks.`;
  if (plan.status !== "ACTIVE") return "Only a plan that is running can be paused.";
  if (plan.familyGroupId) return "A family plan can't be paused here. Message support and we will sort it out.";
  if (plan.installmentsPaid < 1) return "Pay for your first month before pausing.";
  if (plan.pauseUntil && plan.pauseUntil.getTime() > now.getTime()) return "Your plan is already paused.";
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

// ---------------------------------------------------------------------------
// The studio's own pause: any date up to a year out, or with no end date at all (until the owner resumes it).
// ---------------------------------------------------------------------------

/** The furthest an end date may be. Longer than this is an indefinite pause. */
export const ADMIN_PAUSE_MAX_DAYS = 366;
/**
 * An indefinite pause moves the due date and the credits' expiry out by this much, so nothing comes due or expires while it lasts, and
 * resuming moves them back by the same amount less the time actually paused. A pause this long can only be an indefinite one.
 */
export const INDEFINITE_PAUSE_MS = 3650 * DAY;

export function isIndefinitePause(plan: { pausedAt: Date | null; pauseUntil: Date | null }): boolean {
  return Boolean(plan.pausedAt && plan.pauseUntil && plan.pauseUntil.getTime() - plan.pausedAt.getTime() >= INDEFINITE_PAUSE_MS - DAY);
}

export interface AdminPausablePlan {
  status: string;
  familyGroupId: string | null;
  installmentsPaid: number;
  pausedAt: Date | null;
  pauseUntil: Date | null;
}

/** Why the studio cannot pause this plan to `until` (null = indefinitely), in plain words, or null when it can. */
export function adminPauseBlockedReason(plan: AdminPausablePlan, until: Date | null, now: Date): string | null {
  if (plan.status !== "ACTIVE") return "Only a running plan can be paused.";
  if (plan.installmentsPaid < 1) return "The first payment has not been made yet.";
  if (isPausedNow(plan, now)) return "This plan is already paused. Resume it first.";
  if (until !== null) {
    if (Number.isNaN(until.getTime())) return "Pick a date.";
    if (until.getTime() < now.getTime() + DAY / 2) return "Pick a date after today.";
    if (until.getTime() > now.getTime() + ADMIN_PAUSE_MAX_DAYS * DAY) return "Pick a date within a year, or choose indefinitely.";
  }
  return null;
}

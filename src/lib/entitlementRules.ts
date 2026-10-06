// Pure rules for "who can see the curriculum, and how much of it." No Prisma
// or Node imports on purpose, so the edge middleware, client components, and
// server code can all share one definition instead of drifting apart.
//
// The curriculum is no longer sold on its own. It comes with live classes:
// an active Payment Plan opens it, one scale at a time, as the teacher
// approves each next scale. An approved class applicant gets a short trial
// that opens only the first few lessons of the first scale.

export type CurriculumAccessKind = "ADMIN" | "PAID" | "COMPED" | "TRIAL" | "NONE";

export const TRIAL_DAYS = 3;
export const TRIAL_SCALE_SLUG = "major-scale";
/** Lessons (by 0-based order) of the trial scale that stay open during a trial: the first three. */
export const TRIAL_LESSON_COUNT = 3;

/** A late Zelle verification shouldn't lock a paying student out mid-week. */
export const PLAN_GRACE_DAYS = 3;
/** At most one new scale per this many days, even when the teacher approves early. */
export const SCALE_UNLOCK_INTERVAL_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CurriculumEntitlement {
  kind: CurriculumAccessKind;
  /** When this access lapses. Null for ADMIN/COMPED (no expiry) and NONE (nothing to expire). */
  until: Date | null;
}

export interface EntitlementInputs {
  isAdmin: boolean;
  /** Admin-granted complimentary access (the manual Grant button). Never set by a purchase anymore. */
  comped: boolean;
  /**
   * End of the latest paid period across the student's plans that have had
   * at least one installment approved, or null if none. A cancelled plan
   * still counts until this date: cancelling stops future billing, it
   * doesn't claw back a month already paid for.
   */
  planPaidUntil: Date | null;
  trialEndsAt: Date | null;
}

export function resolveEntitlement(input: EntitlementInputs, now: Date = new Date()): CurriculumEntitlement {
  if (input.isAdmin) return { kind: "ADMIN", until: null };

  if (input.planPaidUntil) {
    const graceEnd = new Date(input.planPaidUntil.getTime() + PLAN_GRACE_DAYS * DAY_MS);
    if (graceEnd.getTime() > now.getTime()) return { kind: "PAID", until: graceEnd };
  }

  if (input.comped) return { kind: "COMPED", until: null };

  if (input.trialEndsAt && input.trialEndsAt.getTime() > now.getTime()) {
    return { kind: "TRIAL", until: input.trialEndsAt };
  }

  return { kind: "NONE", until: null };
}

/** Full (drip-gated) curriculum access, as opposed to the trial's fixed slice. */
export function isFullAccess(kind: CurriculumAccessKind): boolean {
  return kind === "ADMIN" || kind === "PAID" || kind === "COMPED";
}

// ---------------------------------------------------------------------------
// Teacher-approved drip
// ---------------------------------------------------------------------------

export interface ApprovalScaleState {
  slug: string;
  order: number;
  status: "LOCKED" | "AVAILABLE" | "IN_PROGRESS" | "COMPLETED";
  /** ms epoch the scale was unlocked for this student, null if it never was. */
  unlockedAt: number | null;
}

export type NextApproval =
  | { state: "ALL_UNLOCKED" }
  | { state: "NEEDS_CHECKLIST"; nextSlug: string; previousSlug: string }
  | { state: "WAITING_PACE"; nextSlug: string; availableAt: number }
  | { state: "READY"; nextSlug: string };

/**
 * Which scale the teacher would approve next for a student, and whether the
 * automatic rules currently allow it. Order 0 is open automatically with
 * full access, so "next" is the first later scale with no unlock.
 *
 * A scale becomes eligible only when (1) the previous scale's whole
 * checklist is done (lessons, practice, quiz) and (2) at least
 * SCALE_UNLOCK_INTERVAL_DAYS have passed since the last unlock. The teacher
 * still clicks approve; an admin can force past both from the matrix.
 */
export function computeNextApproval(scales: ApprovalScaleState[], nowMs: number): NextApproval {
  const ordered = [...scales].sort((a, b) => a.order - b.order);
  const next = ordered.find((s) => s.order > 0 && s.unlockedAt === null && s.status !== "COMPLETED");
  if (!next) return { state: "ALL_UNLOCKED" };

  const previous = ordered.filter((s) => s.order < next.order).pop();
  if (previous && previous.status !== "COMPLETED") {
    return { state: "NEEDS_CHECKLIST", nextSlug: next.slug, previousSlug: previous.slug };
  }

  const lastUnlock = ordered.reduce((max, s) => (s.unlockedAt !== null ? Math.max(max, s.unlockedAt) : max), 0);
  const availableAt = lastUnlock + SCALE_UNLOCK_INTERVAL_DAYS * DAY_MS;
  if (lastUnlock > 0 && availableAt > nowMs) {
    return { state: "WAITING_PACE", nextSlug: next.slug, availableAt };
  }

  return { state: "READY", nextSlug: next.slug };
}

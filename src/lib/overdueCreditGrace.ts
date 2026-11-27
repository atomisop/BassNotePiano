import { CREDITS_PER_CLASS } from "@/lib/classCreditPricing";

/**
 * An established payer (has paid at least once before) whose bill has gone overdue still gets
 * exactly one class, past their paid period, auto-booked at most one credit into the negative
 * (owner setting: payments.overdueCreditGrace). Pure decision only: the caller looks up the
 * plan, whether the one grace class for this overdue stretch is already booked, and the
 * student's effective credit balance, and does the actual booking.
 *
 * The -1 credit floor is checked against the balance AFTER this one grace class is charged, not
 * just "is the balance already negative": classCredits is stored in half-classes (CREDITS_PER_CLASS),
 * and a cadence could in principle cost more than one credit a week, so checking the resulting
 * balance directly is what actually keeps the floor at exactly one credit, rather than relying on
 * every cadence happening to cost at most one credit a week.
 */
export function overdueGraceEligible(opts: {
  graceEnabled: boolean;
  installmentsPaid: number;
  nextDueDate: Date;
  now: Date;
  alreadyGraced: boolean;
  availableCredits: number;
  creditsPerClass: number;
}): boolean {
  if (!opts.graceEnabled) return false;
  if (opts.installmentsPaid <= 0) return false; // a first-time payer never gets this
  if (opts.nextDueDate.getTime() >= opts.now.getTime()) return false; // not actually overdue yet
  if (opts.alreadyGraced) return false; // the one grace class for this overdue stretch is already booked
  if (opts.availableCredits < 0) return false; // already negative for some other reason, never add to it
  if (opts.availableCredits - opts.creditsPerClass < -CREDITS_PER_CLASS) return false; // this class alone would cross the one-credit floor
  return true;
}

// Split out from classSchedule.ts on purpose: that module pulls in Prisma,
// which must never end up in a "use client" bundle (the purchase page's
// quantity/tier picker needs this pure math client-side).

// Type-only: erased at compile time, so importing it here doesn't pull
// Prisma's runtime into a client bundle, same trick already used elsewhere
// in this codebase for a client component that needs a Prisma-defined union
// (e.g. ZellePaymentStatus) without needing the client itself.
import type { PaymentPlanCadence, PaymentPlanTerm } from "@prisma/client";

export const CREDIT_BASE_PRICE_CENTS = 3499; // $34.99 per credit (1 credit = 30 min), full price

/**
 * A class is one fixed length: 45 minutes, priced at $55 a class. Students see
 * classes, never credits. Internally the booking engine still counts in
 * 30-minute credit units, and a class always costs CREDITS_PER_CLASS of them
 * (the same 2 a full hour used to), so a class is one bookable slot and nothing
 * about slots, plans or attendance had to be re-based. Slots start on the hour
 * and a class runs 45 minutes, leaving a 15-minute break after it.
 */
export const CLASS_MINUTES = 45;
export const CREDITS_PER_CLASS = 2;

/**
 * What an extra class costs: a flat $55, no bundle tiers. Extra classes are for
 * extra time on top of a student's weekly class (and for anyone without a plan);
 * a plan's own weekly class is paid by the plan. Deliberately its own number,
 * separate from CREDIT_BASE_PRICE_CENTS above, which still prices Family
 * Bundles.
 */
export const EXTRA_CLASS_PRICE_CENTS = 5500;

/** Pre-discount per-credit price, kept only so marketing pages can show a struck-through "was" price and a % off badge. */
export const CREDIT_ORIGINAL_PRICE_CENTS = 5000;

interface PriceTier {
  minQuantity: number;
  discountRate: number;
}

// Checked in descending minQuantity order. The first (largest) threshold
// a quantity clears wins. This is the one discount ladder for everything:
// the three named presets below are just convenient shortcuts onto it, and
// typing a custom quantity resolves through the exact same tiers.
const TIERS: PriceTier[] = [
  { minQuantity: 20, discountRate: 0.3 },
  { minQuantity: 10, discountRate: 0.2 },
  { minQuantity: 4, discountRate: 0.1 },
  { minQuantity: 1, discountRate: 0 },
];

export interface PresetBundle {
  id: string;
  label: string;
  quantity: number;
}

// Starter/Standard/Best Value: each sits exactly on a discount threshold
// above, so its own math is just calculateClassCreditTotal(quantity).
export const PRESET_BUNDLES: PresetBundle[] = [
  { id: "starter", label: "Starter", quantity: 4 },
  { id: "standard", label: "Standard", quantity: 10 },
  { id: "best-value", label: "Best Value", quantity: 20 },
];

// Not exported: these only bound calculateClassCreditTotal's own clamping
// now. They used to also be the public min/max for the individual custom-
// quantity stepper at /billing/lessons, but that whole a-la-carte purchase
// flow was removed once Monthly/3/6/12-month Payment Plans covered every
// case a single buyer needs, Family bundle (the only remaining caller of
// calculateClassCreditTotal besides historical-payment display) always
// passes one of PRESET_BUNDLES' fixed quantities, never a custom one.
const MIN_CUSTOM_QUANTITY = 1;
const MAX_CUSTOM_QUANTITY = 200;

export interface CreditTotal {
  quantity: number;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  discountRate: number;
  perCreditCents: number;
  /** quantity × the pre-discount $50/credit rate: the "was" price a bundle tier's badge strikes through. Not what's charged; purely the marketing comparison point. */
  originalTotalCents: number;
  /** The real, whole-number % off originalTotalCents that totalCents represents, floored so the badge never overstates it. */
  originalDiscountPercent: number;
}

/** Nearest dollar, then a cent under it: the same $X.99 "charm price" every other price in the app ends on. */
function toCharmPriceCents(cents: number): number {
  return Math.round(cents / 100) * 100 - 1;
}

/**
 * Plan prices are shown and charged as "just under the next $5": round up to
 * the next multiple of $5, then take a cent off ($97.17 becomes $99.99,
 * $108 becomes $109.99, $120 becomes $119.99). Applies to Payment Plan
 * installments and the family bundle's per-student rate. Existing plans keep
 * the rate they enrolled at (it's snapshotted on the PaymentPlan row).
 */
function toPlanPriceCents(cents: number): number {
  return Math.ceil(cents / 500) * 500 - 1;
}

export function calculateClassCreditTotal(quantity: number): CreditTotal {
  const q = Math.min(MAX_CUSTOM_QUANTITY, Math.max(MIN_CUSTOM_QUANTITY, Math.floor(quantity)));
  const tier = TIERS.find((t) => q >= t.minQuantity) ?? TIERS[TIERS.length - 1];
  const subtotalCents = q * CREDIT_BASE_PRICE_CENTS;
  const rawTotalCents = subtotalCents - Math.round(subtotalCents * tier.discountRate);
  // Charm-priced rather than the raw discount math, so every discounted
  // quantity's total (bundle cards, checkout, and the actual amount
  // charged, since this same totalCents is what gets billed) ends in .99
  // instead of landing wherever the percentage happens to fall (e.g.
  // $125.96). Only for tier.discountRate > 0: rounding *up* to the nearest
  // .99 can land a cent or two above the raw total (e.g. 2 credits, no
  // bundle discount, $69.98 rounds up to $69.99), fine when there's a
  // real discount cushioning it, but for an undiscounted quantity that
  // would silently charge a hair more than quantity × CREDIT_BASE_PRICE_CENTS,
  // breaking the "1 credit is always $34.99, that never changes" promise
  // on the pricing page.
  const totalCents = tier.discountRate > 0 ? toCharmPriceCents(rawTotalCents) : rawTotalCents;
  const discountCents = subtotalCents - totalCents;

  // originalTotalCents is quantity × $50, the same comparison the single-
  // credit tier has always struck through ($50.00 → $34.99), extended here
  // to every quantity so a bundle's badge is one real number (the actual
  // combined % off $50/credit) rather than a separate, made-up promotional
  // rate stacked on top of the bundle discount.
  const originalTotalCents = q * CREDIT_ORIGINAL_PRICE_CENTS;
  const originalDiscountPercent = Math.floor((1 - totalCents / originalTotalCents) * 100);

  return {
    quantity: q,
    subtotalCents,
    discountCents,
    totalCents,
    discountRate: tier.discountRate,
    perCreditCents: Math.round(totalCents / q),
    originalTotalCents,
    originalDiscountPercent,
  };
}

// ---------------------------------------------------------------------------
// Payment plans: Monthly, 3, 6, or 12-month commitments to class credits,
// paid in monthly installments, never upfront, never auto-billed (see
// src/lib/paymentPlans.ts for the actual Zelle/installment machinery this
// feeds). This is now the only way a solo buyer purchases class credits,
// the old a-la-carte, buy-any-quantity flow at /billing/lessons was fully
// removed once MONTHLY (0% off, termMonths=1) existed to cover the
// no-commitment case. TIERS/PRESET_BUNDLES/calculateClassCreditTotal above
// are unrelated to this ladder now and stay in use for one thing only:
// redisplaying legacy CLASS_CREDITS payments made before either purchase
// flow existed (PaymentQueue.tsx, billing/history/page.tsx, the
// notification body in payments.ts). Family bundle used to price by raw
// quantity through that same TIERS table too, by direct instruction it now
// reuses this cadence/term ladder instead, same as a solo Payment Plan
// buyer sees, see calculateFamilyBundleTotal below.
//
// Type-only import: PaymentPlanCadence/PaymentPlanTerm are erased at compile
// time, so this stays safe in a "use client" picker, same constraint as the
// rest of this file (see the header comment).
// ---------------------------------------------------------------------------

// The one plan offered is 45 minutes a week at $55 a class: 4 classes a month,
// $220 before term discounts. (Older anchor: $120/mo for 30 min/week and
// $240/mo for 60 min/week, both retired and kept only so existing data types.)
// close to today's live CREDIT_BASE_PRICE_CENTS rate rather than a return to
// CREDIT_ORIGINAL_PRICE_CENTS, so this term ladder rewards a longer
// commitment without also pushing through a price increase.
const PLAN_CADENCE_MONTHLY_BASE_CENTS: Record<PaymentPlanCadence, number> = {
  MIN_30_WEEKLY: 12000,
  // The one live plan: 4 classes x $55.
  MIN_60_WEEKLY: 22000,
};

/**
 * Weekly lengths nobody can newly enroll in. The plan on offer is a single
 * 45-minute class a week, stored as MIN_60_WEEKLY (it books one full hourly
 * slot, 2 internal credits); MIN_30_WEEKLY was retired. Both enum values stay so
 * existing rows still read and display correctly.
 */
export const RETIRED_PLAN_CADENCES: readonly PaymentPlanCadence[] = ["MIN_30_WEEKLY"];

export function isPlanCadenceOffered(cadence: PaymentPlanCadence): boolean {
  return !RETIRED_PLAN_CADENCES.includes(cadence);
}

/** The plan every new subscriber gets. */
export const OFFERED_PLAN_CADENCE: PaymentPlanCadence = "MIN_60_WEEKLY";

// 1 credit = 30 min (matches classSchedule.ts). A plan just supplies the
// monthly credit total, booking itself, and SOLO_MAX_CREDITS's own 2-credit
// per-booking ceiling, are unaffected.
const PLAN_CADENCE_CREDITS_PER_INSTALLMENT: Record<PaymentPlanCadence, number> = {
  MIN_30_WEEKLY: 4,
  MIN_60_WEEKLY: 8,
};

// What the plan's own reserved weekly slot costs to auto-book each week,
// PLAN_CADENCE_CREDITS_PER_INSTALLMENT / 4 weeks, kept as its own explicit
// map rather than divided out at each call site. Used by
// getReservableSlots/the enrollment slot picker (does this chunk have
// room?) and the daily reservation-maintenance job (does the student have
// enough left for this week's occurrence?), see classSchedule.ts.
export const PLAN_CADENCE_CREDITS_PER_WEEK: Record<PaymentPlanCadence, number> = {
  MIN_30_WEEKLY: 1,
  MIN_60_WEEKLY: 2,
};

// 0% / 10% / 20% / 30% off, MONTHLY is the no-commitment baseline (the full
// $120/$240 rate); 10/20/30 are the same three percentages TIERS already
// uses at its 4/10/20-credit breakpoints, just keyed by committed months
// instead of quantity.
const PLAN_TERM_DISCOUNT_RATE: Record<PaymentPlanTerm, number> = {
  MONTHLY: 0,
  TERM_3: 0.1,
  TERM_6: 0.2,
  TERM_12: 0.3,
};

/**
 * Terms nobody can newly enroll in. Yearly (TERM_12) was retired: there isn't
 * a year of curriculum or programming to fill it, so committing anyone to
 * twelve installments promised more than the studio delivers. The enum value
 * and its label stay so existing rows still read and display correctly.
 */
export const RETIRED_PLAN_TERMS: readonly PaymentPlanTerm[] = ["TERM_12"];

export function isPlanTermOffered(term: PaymentPlanTerm): boolean {
  return !RETIRED_PLAN_TERMS.includes(term);
}

const PLAN_TERM_MONTHS: Record<PaymentPlanTerm, number> = {
  MONTHLY: 1,
  TERM_3: 3,
  TERM_6: 6,
  TERM_12: 12,
};

const PLAN_CADENCE_LABEL: Record<PaymentPlanCadence, string> = {
  MIN_30_WEEKLY: "30 min/week",
  MIN_60_WEEKLY: "45 min/week",
};

const PLAN_TERM_LABEL: Record<PaymentPlanTerm, string> = {
  MONTHLY: "Monthly",
  TERM_3: "3-Month",
  TERM_6: "6-Month",
  TERM_12: "Yearly",
};

/**
 * e.g. "6-Month plan, 60 min/week", the one shared label for a
 * cadence+term combination, used by the enrollment picker, the student's
 * plan page, the admin list, and describePayment()'s installment branch
 * (PaymentQueue.tsx and billing/history/page.tsx), so the wording can't
 * drift between them.
 */
export function describePaymentPlan(cadence: PaymentPlanCadence, term: PaymentPlanTerm): string {
  return `${PLAN_TERM_LABEL[term]} plan, ${PLAN_CADENCE_LABEL[cadence]}`;
}

export interface PaymentPlanRate {
  installmentAmountCents: number;
  creditsPerInstallment: number;
  termMonths: number;
  discountRate: number;
  /** installmentAmountCents * termMonths, the total being committed to across the whole term, shown on the enrollment page for transparency. Not charged as one lump sum; see src/lib/paymentPlans.ts. */
  totalCommittedCents: number;
}

/**
 * The locked monthly rate for a cadence + term combination. Snapshotted onto
 * a PaymentPlan row at enrollment (createPaymentPlan in
 * src/lib/paymentPlans.ts) and never recomputed from this function again for
 * that plan, even if the ladder below changes later, a plan's rate is a
 * promise made at signup, not a live price.
 *
 * The discounted rate is then rounded up to just under the next $5
 * (toPlanPriceCents), so the 45 min/week plan is $219.99 / $199.99 / $179.99
 * (Monthly / 3-Month / 6-Month). Math.round
 * on the discount step is a guard against float error from the multipliers.
 */
export function calculatePaymentPlanRate(cadence: PaymentPlanCadence, term: PaymentPlanTerm): PaymentPlanRate {
  const baseCents = PLAN_CADENCE_MONTHLY_BASE_CENTS[cadence];
  const discountRate = PLAN_TERM_DISCOUNT_RATE[term];
  const installmentAmountCents = toPlanPriceCents(Math.round(baseCents * (1 - discountRate)));
  const termMonths = PLAN_TERM_MONTHS[term];

  return {
    installmentAmountCents,
    creditsPerInstallment: PLAN_CADENCE_CREDITS_PER_INSTALLMENT[cadence],
    termMonths,
    discountRate,
    totalCommittedCents: installmentAmountCents * termMonths,
  };
}

// ---------------------------------------------------------------------------
// Family bundle: the same cadence + term a solo Payment Plan buyer picks
// (30/60 min per week, Monthly through Yearly), bought at once for 2+
// separate, already-existing accounts (see createFamilyBundlePayment in
// payments.ts for the account verification this is paired with; this file
// only does the math, on purpose, same "no Prisma in here" reason as the
// header comment). Unlike a solo plan, this is still a single upfront Zelle
// payment for the whole term's credits, not a recurring monthly
// installment: each recipient gets calculatePaymentPlanRate's own
// totalCommittedCents worth of credits (creditsPerInstallment * termMonths)
// in one grant, all at once, non-expiring (see createFamilyBundlePayment
// and its own approveZellePayment branch), same as a family bundle always
// granted its credits. An *additional* FAMILY_BUNDLE_DISCOUNT_RATE off,
// stacked on top of whatever that combined term price already is, e.g. 3
// kids on the 6-Month/30-min term is 3x that term's own already-discounted
// price, then the family rate off that combined total.
// ---------------------------------------------------------------------------

export const FAMILY_BUNDLE_DISCOUNT_RATE = 0.1;
export const MIN_FAMILY_BUNDLE_RECIPIENTS = 2;
export const MAX_FAMILY_BUNDLE_RECIPIENTS = 20; // matches MAX_CUSTOM_QUANTITY's own order of magnitude, a ceiling, not an expectation

export interface FamilyBundleTotal {
  cadence: PaymentPlanCadence;
  term: PaymentPlanTerm;
  recipientCount: number;
  /** creditsPerInstallment * termMonths: the full term's worth for one recipient, granted all at once. */
  creditsPerRecipient: number;
  /** That one recipient's own term price (calculatePaymentPlanRate's totalCommittedCents), unchanged, shown so the combined math is checkable against what a solo Payment Plan buyer would pay across the same term. */
  perRecipientCents: number;
  combinedBeforeFamilyDiscountCents: number;
  familyDiscountCents: number;
  /** One student's monthly rate inside the bundle: the solo rate for this term minus FAMILY_BUNDLE_DISCOUNT_RATE, rounded to just under the next $5. Comparable to the solo card's monthly price. */
  perStudentMonthlyCents: number;
  /** What is actually charged, once, up front: perStudentMonthlyCents * termMonths * recipients. */
  totalCents: number;
}

export function calculateFamilyBundleTotal(
  cadence: PaymentPlanCadence,
  term: PaymentPlanTerm,
  recipientCount: number,
): FamilyBundleTotal {
  const recipients = Math.min(MAX_FAMILY_BUNDLE_RECIPIENTS, Math.max(MIN_FAMILY_BUNDLE_RECIPIENTS, Math.floor(recipientCount)));
  const rate = calculatePaymentPlanRate(cadence, term);
  const perRecipientCents = rate.totalCommittedCents;
  const combinedBeforeFamilyDiscountCents = perRecipientCents * recipients;
  const perStudentMonthlyCents = toPlanPriceCents(Math.round(rate.installmentAmountCents * (1 - FAMILY_BUNDLE_DISCOUNT_RATE)));
  const totalCents = perStudentMonthlyCents * rate.termMonths * recipients;
  return {
    cadence,
    term,
    recipientCount: recipients,
    creditsPerRecipient: rate.creditsPerInstallment * rate.termMonths,
    perRecipientCents,
    combinedBeforeFamilyDiscountCents,
    familyDiscountCents: combinedBeforeFamilyDiscountCents - totalCents,
    perStudentMonthlyCents,
    totalCents,
  };
}

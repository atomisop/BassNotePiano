// The rules behind the plan screen, in plain functions so they are tested without a browser: how many people, what it costs
// right now (counting every row the person has added, filled in or not), and what is still missing before they can start.
import type { PaymentPlanCadence, PaymentPlanTerm } from "@prisma/client";
import {
  MAX_FAMILY_MEMBERS,
  MIN_FAMILY_MEMBERS,
  calculateFamilyBundleTotal,
  calculatePaymentPlanRate,
  discountedPlanPriceCents,
  PLAN_CADENCE_CREDITS_PER_WEEK,
  type PricingConfig,
} from "@/lib/classCreditPricing";

export type Audience = "SOLO" | "FAMILY";

/** The pricing page links here with ?who=family or ?who=solo. Anything else is a solo plan. */
export function parseAudience(value: string | null | undefined): Audience {
  return value?.trim().toLowerCase() === "family" ? "FAMILY" : "SOLO";
}

/** Counts people from the rows of a family form. An added row counts as a person at once, even before an email is typed in it. */
export function headcount(memberRows: string[]): { people: number; filled: number; empty: number; canAdd: boolean; atMax: boolean } {
  const people = 1 + memberRows.length;
  const filled = memberRows.filter((row) => row.trim().length > 0).length;
  return { people, filled, empty: memberRows.length - filled, canAdd: people < MAX_FAMILY_MEMBERS, atMax: people >= MAX_FAMILY_MEMBERS };
}

export interface CheckoutTotals {
  people: number;
  /** How many payments the plan is (1, 3 or 6). */
  payments: number;
  /** One person's price for one 28-day payment. */
  perPaymentCents: number;
  /** The first payment: everyone's first 28 days together (just yours for a solo plan). */
  firstPaymentCents: number;
  /** One person's price over the whole term. */
  perPersonTermCents: number;
  /** Everyone's price over the whole term. */
  allPeopleTermCents: number;
  /** The 1 Month plan's price per payment, to show what a longer plan saves. */
  listPerPaymentCents: number;
  classesPerPayment: number;
}

export function checkoutTotals(input: {
  cadence: PaymentPlanCadence;
  term: PaymentPlanTerm;
  pricing: PricingConfig;
  audience: Audience;
  memberRows: string[];
  personalDiscountPercent?: number;
}): CheckoutTotals {
  const { cadence, term, pricing, audience, memberRows, personalDiscountPercent = 0 } = input;
  const list = calculatePaymentPlanRate(cadence, term, pricing);
  const monthly = calculatePaymentPlanRate(cadence, "MONTHLY", pricing);
  const people = audience === "FAMILY" ? Math.min(MAX_FAMILY_MEMBERS, Math.max(MIN_FAMILY_MEMBERS, headcount(memberRows).people)) : 1;
  // A family keeps the family rate; the owner's personal discount applies to a solo plan, the same rule the server charges by.
  const perPaymentCents =
    audience === "FAMILY"
      ? calculateFamilyBundleTotal(cadence, term, people, pricing).perStudentMonthlyCents
      : personalDiscountPercent > 0
        ? discountedPlanPriceCents(list.installmentAmountCents, personalDiscountPercent)
        : list.installmentAmountCents;
  return {
    people,
    payments: list.termMonths,
    perPaymentCents,
    firstPaymentCents: perPaymentCents * people,
    perPersonTermCents: perPaymentCents * list.termMonths,
    allPeopleTermCents: perPaymentCents * list.termMonths * people,
    listPerPaymentCents: monthly.installmentAmountCents,
    classesPerPayment: list.creditsPerInstallment / PLAN_CADENCE_CREDITS_PER_WEEK[cadence],
  };
}

/** What is still needed before the plan can start, in the order the page asks for it, or null when nothing is. */
export function missingForCheckout(input: { audience: Audience; memberRows: string[]; slotChosen: boolean }): string | null {
  if (input.audience === "FAMILY") {
    const { empty } = headcount(input.memberRows);
    if (input.memberRows.length === 0) return "Add at least one more person";
    if (empty > 0) return empty === 1 ? "Type that person's account email, or remove the empty row" : "Type each person's account email, or remove the empty rows";
  }
  if (!input.slotChosen) return "Pick your weekly time";
  return null;
}

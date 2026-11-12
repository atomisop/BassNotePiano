// The rules behind the plan screen, in plain functions so they are tested without a browser: how many people, what it costs
// right now (counting every row the person has added, filled in or not), and what is still missing before they can start.
import type { PaymentPlanCadence, PaymentPlanTerm } from "@prisma/client";
import {
  MAX_FAMILY_MEMBERS,
  MIN_FAMILY_MEMBERS,
  calculateFamilyBundleTotal,
  calculatePaymentPlanRate,
  discountedPlanPriceCents,
  discountPercentForTerm,
  PLAN_CADENCE_CREDITS_PER_WEEK,
  SCHOLARSHIP_TERM,
  type PricingConfig,
} from "@/lib/classCreditPricing";

export type Audience = "SOLO" | "FAMILY";

/**
 * Whether "Have a scholarship code?" is offered on the plan screen. A scholarship prices ONE plan length, the 6 Month plan
 * (`SCHOLARSHIP_TERM`), so the link appears only while that length is the chosen one and is gone for every other length. It is also
 * gone when the screen cannot claim one, for a plan that is not for one person (a group or parent plan prices every member at the
 * group rate, see checkoutTotals), and once a scholarship is already claimed.
 */
export function showScholarshipClaim(input: { canClaim: boolean; audience: Audience; term: string; scholarshipPercent: number }): boolean {
  return input.canClaim && input.audience === "SOLO" && input.term === SCHOLARSHIP_TERM && input.scholarshipPercent === 0;
}

/** The pricing page links here with ?who=family or ?who=solo. Anything else is a solo plan. */
export function parseAudience(value: string | null | undefined): Audience {
  const v = value?.trim().toLowerCase();
  return v === "family" || v === "group" || v === "parent" ? "FAMILY" : "SOLO";
}

/** "?who=parent" opens the plan page in parent mode (a parent paying for the children they linked). */
export function parseParentMode(value: string | null | undefined): boolean {
  return value?.trim().toLowerCase() === "parent";
}

/** People on a parent-paid plan: the linked children typed in, plus the parent when they learn too. */
export function parentHeadcount(childRows: string[], includeSelf: boolean): { people: number; filled: number; empty: number; canAdd: boolean; atMax: boolean } {
  const people = childRows.length + (includeSelf ? 1 : 0);
  const filled = childRows.filter((row) => row.trim().length > 0).length;
  return { people, filled, empty: childRows.length - filled, canAdd: people < MAX_FAMILY_MEMBERS, atMax: people >= MAX_FAMILY_MEMBERS };
}

/** Counts people from the rows of a group form. An added row counts as a person at once, even before an email is typed in it. */
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
  /** A scholarship's percent: it only counts when `term` is the 6 Month plan. */
  scholarshipPercent?: number;
  /** Parent mode: the rows are children, the parent counts as a person only when they learn too, and one person pays the solo price. */
  parent?: { includeSelf: boolean };
}): CheckoutTotals {
  const { cadence, term, pricing, audience, memberRows, personalDiscountPercent = 0, scholarshipPercent = 0, parent } = input;
  const discountPercent = discountPercentForTerm({ percent: personalDiscountPercent, scholarshipPercent }, term);
  const list = calculatePaymentPlanRate(cadence, term, pricing);
  const monthly = calculatePaymentPlanRate(cadence, "MONTHLY", pricing);
  const people =
    audience === "FAMILY"
      ? parent
        ? Math.min(MAX_FAMILY_MEMBERS, Math.max(1, parentHeadcount(memberRows, parent.includeSelf).people))
        : Math.min(MAX_FAMILY_MEMBERS, Math.max(MIN_FAMILY_MEMBERS, headcount(memberRows).people))
      : 1;
  // A group keeps the group rate; the owner's personal discount applies to a solo plan, the same rule the server charges by.
  // A parent paying for one person pays the solo price (no personal discount, it is the child's plan), for two or more the group rate.
  const perPaymentCents =
    audience === "FAMILY" && people >= 2
      ? calculateFamilyBundleTotal(cadence, term, people, pricing).perStudentMonthlyCents
      : audience === "FAMILY"
        ? list.installmentAmountCents
        : discountPercent > 0
          ? discountedPlanPriceCents(list.installmentAmountCents, discountPercent)
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

/** The same weekly time picked for two people on one plan (each person needs a time of their own), or false. */
export function duplicateWeeklyTime(slots: { scheduleId: string; chunkIndex: number }[]): boolean {
  const keys = slots.map((s) => `${s.scheduleId}:${s.chunkIndex}`);
  return new Set(keys).size !== keys.length;
}

/** The people on a parent-paid plan who each need a weekly time: every filled-in child email (once), then the parent if they learn too.
 *  The key is the lowercased email, or "self" for the parent. */
export function parentTimeHolders(memberRows: string[], includeSelf: boolean): { key: string; label: string }[] {
  const seen = new Set<string>();
  const holders: { key: string; label: string }[] = [];
  for (const row of memberRows) {
    const email = row.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    holders.push({ key: email, label: row.trim() });
  }
  if (includeSelf) holders.push({ key: "self", label: "You" });
  return holders;
}

/** What is still needed before the plan can start, in the order the page asks for it, or null when nothing is. */
export function missingForCheckout(input: { audience: Audience; memberRows: string[]; slotChosen: boolean; parent?: boolean }): string | null {
  if (input.audience === "FAMILY") {
    const { empty } = headcount(input.memberRows);
    if (input.memberRows.length === 0) return input.parent ? "Add your child's account" : "Add a person";
    if (empty > 0) return empty === 1 ? "Fill in or remove the empty email" : "Fill in or remove the empty emails";
  }
  if (!input.slotChosen) return "Pick a weekly time";
  return null;
}

/** The reply when the first payment on screen is no longer the real one (the owner changed a price while the review was open). */
export const PRICE_CHANGED_MESSAGE = "The price changed while you were looking. We refreshed it. Please check the new price and start again.";

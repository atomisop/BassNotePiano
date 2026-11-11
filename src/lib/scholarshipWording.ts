/**
 * Pure wording for bills on a scholarship (no database), tested in tests/scholarshipWording.test.ts.
 *
 * The owner's rule: a FULL (100%) scholarship never reads as a bill. No amount, nothing "due", nothing "ready". A PARTIAL
 * scholarship gets an ordinary bill that says plainly what the scholarship covered and what is left.
 */

/** The one plan length a scholarship prices. A plain string so this file needs nothing else. */
const SCHOLARSHIP_TERM = "TERM_6";

/** How many 28-day cycles are added each time a fully covered plan continues: another 6 Months. */
export const SCHOLARSHIP_RENEWAL_CYCLES = 6;

/** What a fully covered plan or cycle shows wherever an amount or a bill would be: never "$0.00", never "pay". */
export const COVERED_BY_SCHOLARSHIP = "Covered by your scholarship";
export const NOTHING_TO_PAY = "Nothing to pay";

/** A plan whose price per bill is nothing is fully covered: its screens show no amount, no bill count and no Pay. */
export function isCoveredPlan(priceCents: number | null | undefined): boolean {
  return priceCents === 0;
}

const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

/** The bell notice for one covered 28-day cycle. `creditsNote` is a whole sentence part such as "4 credits are on your account". */
export function coveredBillNotice(creditsNote: string): { title: string; body: string } {
  return { title: COVERED_BY_SCHOLARSHIP, body: `Your scholarship covers your next 28 days. ${creditsNote}. ${NOTHING_TO_PAY}.` };
}

/** The one notice when a fully covered plan reaches its last cycle and goes on by itself. */
export function scholarshipRenewedNotice(input: { slot?: string | null; creditsNote?: string | null }): { title: string; body: string } {
  let body = "Your scholarship plan continues. Nothing to pay.";
  if (input.slot) body += ` Your weekly class stays ${input.slot}.`;
  if (input.creditsNote) body += ` ${input.creditsNote}.`;
  return { title: "Your scholarship plan continues", body };
}

/**
 * What a student is told when a scholarship or discount moved their plan's price. A plan that now costs nothing is never given a
 * price, a bill or a "$0.00": it is simply covered.
 */
export function planPriceChangeNotice(change: { fromCents: number; toCents: number; openBillChanged: boolean }): { title: string; body: string } {
  if (change.toCents === 0) return { title: "Your scholarship covers your plan", body: "Your scholarship now covers your plan in full. Your classes go on as they are. Nothing to pay." };
  return {
    title: "Your plan price changed",
    body: `Your price per payment is now ${usd(change.toCents)}${change.fromCents === 0 ? "" : ` (it was ${usd(change.fromCents)})`}. It applies to your next bill${change.openBillChanged ? ", and the bill that is open now has been updated" : ""}.`,
  };
}

export interface PartialScholarship {
  percent: number;
  /** What the scholarship took off this bill. */
  coveredCents: number;
  /** What the bill asks for. */
  leftCents: number;
}

/**
 * What a partial scholarship did to one bill, or null when the scholarship is not what prices it: a plan of another length, no
 * scholarship, a full one (that bill is $0 and is never shown), a bigger personal discount (then the scholarship is not the reason
 * for the price, so it is not named), or no known price before the discount.
 */
export function partialScholarship(input: { term: string; listCents: number | null; billCents: number; scholarshipPercent: number; generalPercent: number }): PartialScholarship | null {
  if (input.term !== SCHOLARSHIP_TERM) return null;
  const percent = Math.floor(input.scholarshipPercent);
  if (!(percent >= 1 && percent <= 99)) return null;
  if (input.generalPercent > percent) return null;
  if (input.listCents === null || input.billCents <= 0 || input.listCents <= input.billCents) return null;
  return { percent, coveredCents: input.listCents - input.billCents, leftCents: input.billCents };
}

/** "Your 50% scholarship covers $90.00 of this bill. $89.99 is left to pay." */
export function scholarshipDueLine(s: PartialScholarship): string {
  return `Your ${s.percent}% scholarship covers ${usd(s.coveredCents)} of this bill. ${usd(s.leftCents)} is left to pay.`;
}

/** "With your 50% scholarship, $89.99 is left to pay." For a bill that is already late. */
export function scholarshipOverdueLine(s: PartialScholarship): string {
  return `With your ${s.percent}% scholarship, ${usd(s.leftCents)} is left to pay.`;
}

/** The body of the "installment due" bell notice. Unchanged for a bill with no scholarship. */
export function installmentDueBody(input: { installmentLabel: string; planLabel: string; scholarship: PartialScholarship | null }): string {
  const base = `${input.installmentLabel} on your ${input.planLabel} is ready to pay.`;
  return input.scholarship ? `${base} ${scholarshipDueLine(input.scholarship)}` : base;
}

/** The body of the "installment overdue" bell notice. Unchanged for a bill with no scholarship. */
export function installmentOverdueBody(input: { installmentLabel: string; planLabel: string; overdueDays: number; daysLeft: number; scholarship: PartialScholarship | null }): string {
  const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
  const late = `${input.installmentLabel} on your ${input.planLabel} is ${days(input.overdueDays)} overdue.`;
  const consequence = `If it does not arrive in ${days(input.daysLeft)}, your plan is canceled and you lose access to your account.`;
  return input.scholarship ? `${late} ${scholarshipOverdueLine(input.scholarship)} ${consequence}` : `${late} ${consequence}`;
}

/**
 * Whether a plan that just had its last bill settled goes on by itself: only a solo 6 Month plan that costs nothing, held by an
 * account in good standing whose scholarship is still 100%.
 */
export function mayContinueOnScholarship(input: { term: string; priceCents: number; inGroup: boolean; scholarshipPercent: number; banned: boolean; paymentLocked: boolean; isAdmin: boolean }): boolean {
  return input.term === SCHOLARSHIP_TERM && input.priceCents === 0 && !input.inGroup && input.scholarshipPercent >= 100 && !input.banned && !input.paymentLocked && !input.isAdmin;
}

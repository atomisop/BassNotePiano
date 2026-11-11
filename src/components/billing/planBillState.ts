import type { ZellePaymentStatus } from "@prisma/client";

/**
 * The words the plan screen uses for a plan's bill, in one place, so the band at the top of Billing > Plans and the card shown right
 * after a plan is started on the form always say the same thing. Wording only: nothing here decides what is owed.
 */

export interface PlanBillPlan {
  installmentsPaid: number;
  termMonths: number;
  /** While the first payment is still missing: when the held weekly time would be released (ISO). */
  heldUntil?: string | null;
}

export interface PlanBillInstallment {
  status: ZellePaymentStatus;
  amountCents: number;
  installmentNumber: number | null;
  /** A group's one combined 28-day bill. */
  isBundle?: boolean;
}

export interface PlanBillGroup {
  isPayer: boolean;
  payerName: string | null;
  memberCount: number;
  waitingForStart: boolean;
  memberNames?: string[];
  weeklyTime?: string | null;
}

export interface PlanBillState {
  /** Null for a running plan: status is said only when it is news (DESIGN.md, Hierarchy 5). */
  label: string | null;
  tone: "warning" | "danger";
  note: string | null;
}

function usd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/**
 * A plan exists the moment it is set up (its weekly time is held), but it only starts once the first payment arrives. Which of
 * those states this is, in plain words.
 */
export function planBillState(plan: PlanBillPlan, installment: PlanBillInstallment | null, memberView: boolean): PlanBillState {
  if (plan.installmentsPaid !== 0) return { label: null, tone: "warning", note: null };
  if (memberView) return { label: "Waiting for the first payment", tone: "warning", note: null };
  if (installment?.status === "PENDING_REVIEW") return { label: "Payment sent, we are checking it", tone: "warning", note: "Thanks. Your plan starts as soon as we confirm it." };
  if (installment?.status === "REJECTED") return { label: "Payment problem", tone: "danger", note: "We could not match your payment. See below to try again." };
  const firstAmount = installment ? usd(installment.amountCents) : null;
  return {
    label: "Waiting for your first payment",
    tone: "warning",
    note: `Your weekly time is held for you${plan.heldUntil ? ` until ${new Date(plan.heldUntil).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}` : ""}. Your plan, credits and classes start when your first payment${firstAmount ? ` of ${firstAmount}` : ""} arrives. Send it below, or the time is released to someone else.`,
  };
}

/** Who pays a group plan and how, as one short paragraph. */
export function groupPlanSentence(group: PlanBillGroup): string {
  const memberView = !group.isPayer;
  // One person on the plan (a parent paying for one child): there is no "everyone else", so the sentence only says who pays.
  if (group.memberCount < 2) {
    const payer = group.payerName ?? "The person who set it up";
    const lead = memberView
      ? group.waitingForStart
        ? `Your classes start when ${group.payerName ?? "the person who set it up"} sends the first payment. There is nothing for you to pay.`
        : `${payer} pays your 28-day bill from their own bank account. You never have to pay it yourself.`
      : group.waitingForStart
        ? "The plan starts when this first payment arrives, and it must come from your own bank account."
        : "You pay the 28-day bill from your own bank account.";
    return lead + (group.weeklyTime ? ` Your weekly class: ${group.weeklyTime}.` : "");
  }
  const lead = memberView
    ? group.waitingForStart
      ? `This is a group plan for ${group.memberCount} accounts. Your classes start when ${group.payerName ?? "the person who set it up"} sends the combined first payment. There is nothing for you to pay.`
      : `This is a group plan for ${group.memberCount} accounts. ${group.payerName ?? "The person who set it up"} pays your 28-day bill, together with everyone else's, from their own bank account. You never have to pay it yourself.`
    : group.waitingForStart
      ? `Group plan for ${group.memberCount} accounts. Everyone starts together when this combined first payment arrives, and it must come from your own bank account.`
      : `Group plan for ${group.memberCount} accounts. You pay one combined 28-day bill for everyone, from your own bank account, and get one receipt.`;
  return (
    lead +
    (group.memberNames && group.memberNames.length > 0 ? ` In this group: ${group.memberNames.join(", ")}.` : "") +
    (group.weeklyTime ? ` Your own weekly class: ${group.weeklyTime}. It is not a shared class, and everyone else in the group picks their own times.` : "")
  );
}

/** What the payment sheet calls this bill ("Bill 2 of 3", "First payment for 3 accounts"). */
export function planBillName(plan: PlanBillPlan, installment: PlanBillInstallment, group: PlanBillGroup | null): string {
  if (group?.waitingForStart) return `First payment for ${group.memberCount} accounts`;
  if (installment.isBundle) return `One bill for ${group?.memberCount ?? "everyone in the"} accounts`;
  return `Bill ${installment.installmentNumber ?? plan.installmentsPaid + 1} of ${plan.termMonths}`;
}

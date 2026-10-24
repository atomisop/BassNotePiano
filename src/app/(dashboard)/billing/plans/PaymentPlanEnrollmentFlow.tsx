"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PaymentPlanCadence, PaymentPlanTerm, ZellePaymentStatus } from "@prisma/client";
import { calculateFamilyBundleTotal, calculatePaymentPlanRate, describePaymentPlan, MAX_FAMILY_MEMBERS, type PricingConfig, OFFERED_PLAN_CADENCE } from "@/lib/classCreditPricing";
import { PRICE_CHANGED_MESSAGE, type Audience } from "@/lib/planCheckout";
import { useFamilyInvites } from "@/components/billing/useFamilyInvites";
import { ZelleUnlockGate } from "@/components/billing/ZelleUnlockGate";
import { ProgressBar } from "@/components/ui/ProgressBar";
import {
  confirmSwitchToFamilyAction,
  enrollFamilyPlanAction,
  enrollInPaymentPlanAction,
  getReservableSlotsAction,
  getWaitlistAction,
  checkFamilyMemberAction,
  cancelFamilyInviteAction,
  listMyFamilyInvitesAction,
  sendFamilyInviteAction,
  setWaitlistAction,
  requestSwitchToFamilyCodeAction,
  submitPlanInstallmentPaymentAction,
} from "./actions";
import { NewPlanForm, type StartPlanInput, type StartPlanResult } from "./NewPlanForm";
import { buttonVariants } from "@/components/ui/button";

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export interface ActivePlanSummary {
  id: string;
  cadence: PaymentPlanCadence;
  term: PaymentPlanTerm;
  installmentsPaid: number;
  termMonths: number;
}

/** What a family plan changes on this page. Null for a solo plan. */
export interface FamilyPlanInfo {
  isPayer: boolean;
  payerName: string | null;
  memberCount: number;
  /** True until the family's combined first payment has been approved. */
  waitingForStart: boolean;
  /** Everyone in the family, the payer first. */
  memberNames?: string[];
  /** e.g. "Wednesdays 6:30 PM to 7:15 PM". */
  weeklyTime?: string | null;
}

/** One family member's monthly bill, shown to the family's payer. */
export interface FamilyBillSummary {
  planId: string;
  memberName: string;
  payment: OpenInstallmentSummary;
}

export interface OpenInstallmentSummary {
  id: string;
  status: ZellePaymentStatus;
  rejectionReason: string | null;
  amountCents: number;
  installmentNumber: number | null;
}

interface PaymentPlanEnrollmentFlowProps {
  zelleHandle: string;
  activePlan: ActivePlanSummary | null;
  openInstallment: OpenInstallmentSummary | null;
  /** ISO date string. Set only when activePlan exists but openInstallment doesn't yet: the next installment isn't payable until it's within INSTALLMENT_OPEN_LEAD_DAYS of this date (see getOrCreateOpenInstallmentPayment). Renders as a "your next installment opens on X" state instead of a payable invoice. */
  nextInstallmentDueDate?: string;
  family?: FamilyPlanInfo | null;
  familyBills?: FamilyBillSummary[];
  /** A switch to a family plan waiting for its combined first payment (the current plan keeps running until it is approved). */
  pendingSwitch?: { payment: OpenInstallmentSummary; memberCount: number } | null;
  /** Preselects the plan from a pricing-page button (?term=&who=): its length, and "just me" or "family". */
  initialCadence?: PaymentPlanCadence;
  initialTerm?: PaymentPlanTerm;
  initialAudience?: Audience;
  /** The owner's current prices (Admin > Pricing). */
  pricing: PricingConfig;
  /** This account's personal percent off a solo plan (set by the owner), 0 when none. */
  personalDiscountPercent?: number;
}

/**
 * For someone already on a solo plan: add family members and switch. Nothing changes until the family's combined first payment is
 * approved, and the switch needs the account password plus an emailed code.
 */
function SwitchToFamilyPanel({
  term,
  pricing,
  onStarted,
}: {
  term: PaymentPlanTerm;
  pricing: PricingConfig;
  onStarted: (payment: OpenInstallmentSummary, memberCount: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [emails, setEmails] = useState<string[]>([""]);
  const [step, setStep] = useState<"people" | "confirm">("people");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typed = emails.map((e) => e.trim()).filter(Boolean);
  const invites = useFamilyInvites(INVITE_API, open);
  // Nobody is put on a family without saying yes: the code step opens once every typed email has accepted.
  const states = typed.map((e) => invites.status[e.toLowerCase()]);
  const allAccepted = typed.length > 0 && states.every((st) => st === "ACCEPTED");
  const toInvite = typed.filter((e, i) => !states[i]);
  // Every row added counts as a person at once, so the price follows the taps, not only the typing.
  const people = Math.max(2, emails.length + 1);
  const price = calculateFamilyBundleTotal(OFFERED_PLAN_CADENCE, term, people, pricing);
  const field = "h-11 w-full rounded-control bg-neu-base px-4 text-body text-slate-100 shadow-pressed-low outline-none focus-visible:ring-2 focus-visible:ring-ring";

  async function sendCode() {
    setBusy(true);
    setError(null);
    const result = await requestSwitchToFamilyCodeAction(password).catch(() => ({ ok: false, error: "Something went wrong. Try again." }));
    setBusy(false);
    if (!result.ok) return setError(result.error ?? "Could not send the code.");
    setStep("confirm");
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    const result = await confirmSwitchToFamilyAction(password, code, term, null, null, typed, price.perStudentMonthlyCents * people).catch(() => null);
    setBusy(false);
    if (!result || !result.ok || !result.startPaymentId || result.amountCents === null) return setError(result?.error ?? "Something went wrong. Try again.");
    onStarted({ id: result.startPaymentId, status: "AWAITING_TRANSFER", rejectionReason: null, amountCents: result.amountCents, installmentNumber: 1 }, result.memberCount);
  }

  if (!open) {
    return (
      <div className="mt-6 rounded-xl bg-neu-base p-4 shadow-raised-low">
        <p className="text-small font-semibold text-slate-50">Joining others? Switch to a family plan</p>
        <p className="mt-1 text-small text-slate-400">Everyone gets the family price. Your current plan keeps running until the family&apos;s first payment is approved, then it is replaced with the same weekly time.</p>
        <button type="button" onClick={() => setOpen(true)} className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-3" })}>
          Add family members
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-3 rounded-xl bg-neu-base p-4 shadow-raised-low">
      <p className="text-small font-semibold text-slate-50">Switch to a family plan</p>
      {step === "people" ? (
        <>
          <p className="text-small text-slate-400">
            Each person needs their own account first (their own name; a child can sign up without a phone number). You pay for everyone from your own bank
            account. If anyone cannot start, nobody does, and your current plan is not touched.
          </p>
          {emails.map((email, i) => (
            <input
              key={i}
              type="email"
              inputMode="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmails((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
              placeholder="Family member's account email"
              aria-label={`Family member ${i + 1} email`}
              className={field}
            />
          ))}
          {emails.length + 1 < MAX_FAMILY_MEMBERS && (
            <button type="button" onClick={() => setEmails((prev) => [...prev, ""])} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Add another person
            </button>
          )}
          <div className="rounded-control bg-neu-base p-3 text-small text-slate-300 shadow-pressed-low">
            <div className="flex justify-between"><span>Each person, every 28 days</span><span>{formatUsd(price.perStudentMonthlyCents)}</span></div>
            <div className="mt-1 flex justify-between font-semibold text-slate-50"><span>First payment, {people} people together</span><span>{formatUsd(price.perStudentMonthlyCents * people)}</span></div>
          </div>
          {typed.length > 0 && (
            <ul className="space-y-1 text-small">
              {typed.map((e, i) => (
                <li key={e + i} className="flex items-center justify-between gap-2 text-slate-300">
                  <span className="min-w-0 truncate">{e}</span>
                  <span className={states[i] === "ACCEPTED" ? "text-emerald-400" : states[i] === "DECLINED" ? "text-amber-300" : "text-slate-400"}>
                    {states[i] === "ACCEPTED" ? "Accepted" : states[i] === "DECLINED" ? "Declined" : states[i] === "SENDING" ? "Sending…" : states[i] === "PENDING" ? "Waiting for them" : "Not invited yet"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {toInvite.length > 0 && (
            <button type="button" onClick={() => void invites.send(toInvite)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              {toInvite.length === 1 ? "Send invitation" : `Send ${toInvite.length} invitations`}
            </button>
          )}
          {invites.error && <p className="text-small text-red-400">{invites.error}</p>}
          <p className="text-small text-slate-400">Everyone has to accept first. Then enter your password to confirm, and we email you a code.</p>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" aria-label="Your password" className={field} />
          {error && <p className="text-small text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={busy || !allAccepted || !password} onClick={sendCode} className={buttonVariants({ variant: "primary", size: "sm" })}>
              {busy ? "Sending…" : "Email me a code"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className={buttonVariants({ variant: "secondary", size: "sm" })}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          <p className="text-small text-slate-400">Enter the 6-digit code we emailed you.</p>
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" aria-label="Code" className={field} />
          {error && <p className="text-small text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={busy || code.length < 6} onClick={confirm} className={buttonVariants({ variant: "primary", size: "sm" })}>
              {busy ? "Setting up…" : "Confirm switch"}
            </button>
            <button type="button" onClick={() => { setStep("people"); setCode(""); }} className={buttonVariants({ variant: "secondary", size: "sm" })}>Back</button>
          </div>
        </>
      )}
    </div>
  );
}

const INVITE_API = { list: listMyFamilyInvitesAction, send: sendFamilyInviteAction, cancel: cancelFamilyInviteAction };

/**
 * Handles both states of /billing/plans: no active plan (the cadence/term
 * picker below) and an active plan with something to pay (progress +
 * ZelleUnlockGate), same "one component switches on local state, not two
 * separate pages" shape the old a-la-carte credit purchase flow used to use.
 */
export function PaymentPlanEnrollmentFlow({
  zelleHandle,
  activePlan: initialPlan,
  openInstallment: initialInstallment,
  nextInstallmentDueDate,
  family = null,
  familyBills = [],
  pendingSwitch: initialSwitch = null,
  initialTerm,
  initialAudience,
  pricing,
  personalDiscountPercent = 0,
}: PaymentPlanEnrollmentFlowProps) {
  // One plan: a 45-minute class a week. (initialCadence from old links is ignored.)
  const cadence: PaymentPlanCadence = OFFERED_PLAN_CADENCE;
  const [pendingSwitch, setPendingSwitch] = useState(initialSwitch);
  // installment is nullable now: an active plan can have nothing payable yet
  // (see nextInstallmentDueDate above), that's still "enrolled", just
  // between installments, not the picker below.
  const router = useRouter();
  const [enrolled, setEnrolled] = useState<{ plan: ActivePlanSummary; installment: OpenInstallmentSummary | null; family?: FamilyPlanInfo | null } | null>(
    initialPlan ? { plan: initialPlan, installment: initialInstallment, family } : null,
  );
  // The page re-fetches its data when a payment clears or anything else changes. Local state started from the first copy of it, so
  // it is replaced whenever the server's copy changes: what is shown is always the real state of the plan and its bills.
  const serverCopy = JSON.stringify([initialPlan, initialInstallment, family, initialSwitch]);
  useEffect(() => {
    setEnrolled(initialPlan ? { plan: initialPlan, installment: initialInstallment, family } : null);
    setPendingSwitch(initialSwitch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverCopy]);

  /** The form's server calls: start a solo or family plan, and move to the payment screen once it exists. */
  async function startPlan({ audience, term, slot, memberEmails, expectedFirstPaymentCents }: StartPlanInput): Promise<StartPlanResult> {
    const termPayments = calculatePaymentPlanRate(cadence, term, pricing).termMonths;
    if (audience === "FAMILY") {
      let result: Awaited<ReturnType<typeof enrollFamilyPlanAction>>;
      try {
        result = await enrollFamilyPlanAction(term, slot.scheduleId, slot.chunkIndex, memberEmails, expectedFirstPaymentCents);
      } catch {
        return { ok: false, error: "Something went wrong starting the family plan. Please try again." };
      }
      if (result.error === PRICE_CHANGED_MESSAGE) router.refresh();
      if (!result.ok || !result.planId || !result.startPaymentId || result.amountCents === null) {
        return { ok: false, error: result.error ?? "Something went wrong starting the family plan." };
      }
      setEnrolled({
        plan: { id: result.planId, cadence, term, installmentsPaid: 0, termMonths: termPayments },
        installment: { id: result.startPaymentId, status: "AWAITING_TRANSFER", rejectionReason: null, amountCents: result.amountCents, installmentNumber: 1 },
        family: { isPayer: true, payerName: null, memberCount: result.memberCount, waitingForStart: true },
      });
      return { ok: true };
    }
    let result: Awaited<ReturnType<typeof enrollInPaymentPlanAction>>;
    try {
      result = await enrollInPaymentPlanAction(cadence, term, slot.scheduleId, slot.chunkIndex, expectedFirstPaymentCents);
    } catch {
      return { ok: false, error: "Something went wrong starting your plan. Please try again." };
    }
    if (result.error === PRICE_CHANGED_MESSAGE) router.refresh();
    if (!result.ok || !result.planId || !result.installmentPaymentId || result.amountCents === null) {
      return { ok: false, error: result.error ?? "Something went wrong starting your plan." };
    }
    setEnrolled({
      plan: { id: result.planId, cadence, term, installmentsPaid: 0, termMonths: termPayments },
      installment: { id: result.installmentPaymentId, status: "AWAITING_TRANSFER", rejectionReason: null, amountCents: result.amountCents, installmentNumber: 1 },
    });
    return { ok: true };
  }

  if (enrolled) {
    const { plan, installment } = enrolled;
    const fam = enrolled.family ?? null;
    const memberView = fam !== null && !fam.isPayer;
    const planLabel = describePaymentPlan(plan.cadence, plan.term);
    const progressPercent = Math.min(100, (plan.installmentsPaid / plan.termMonths) * 100);

    return (
      <div>
        {pendingSwitch && (
          <div className="mb-6">
            <p className="mb-3 rounded-xl bg-neu-base px-3.5 py-3 text-small text-slate-300 shadow-pressed-low">
              Switching to a family plan of {pendingSwitch.memberCount} people. Your current plan below keeps running until this combined first payment is approved, then it
              is replaced by the family plan at the same weekly time. If it does not arrive in time, nothing changes.
            </p>
            <ZelleUnlockGate
              status={pendingSwitch.payment.status}
              rejectionReason={pendingSwitch.payment.rejectionReason}
              scaleCode={`First payment for ${pendingSwitch.memberCount} accounts`}
              scaleTitle="Family plan"
              eyebrowLabel="Family plan"
              amountCents={pendingSwitch.payment.amountCents}
              zelleHandle={zelleHandle}
              paymentId={pendingSwitch.payment.id}
              onSubmitPayment={submitPlanInstallmentPaymentAction.bind(null, pendingSwitch.payment.id)}
            />
          </div>
        )}
        <div className="mb-4 rounded-xl p-4 bg-neu-base shadow-raised-low">
          <p className="text-small text-slate-100">{planLabel}</p>
          <p className="mt-1 text-small text-slate-500">
            {plan.installmentsPaid} of {plan.termMonths} installments paid
          </p>
          <ProgressBar className="mt-2" value={progressPercent} label="Installments paid" />
        </div>
        {fam && (
          <p className="mb-4 rounded-xl bg-neu-base px-3.5 py-3 text-small text-slate-300 shadow-pressed-low">
            {memberView
              ? fam.waitingForStart
                ? `This is a family plan for ${fam.memberCount} accounts. Your classes start when ${fam.payerName ?? "the person who set it up"} sends the combined first payment. There is nothing for you to pay.`
                : `This is a family plan for ${fam.memberCount} accounts. ${fam.payerName ?? "The person who set it up"} pays your 28-day bill from their own bank account.`
              : fam.waitingForStart
                ? `Family plan for ${fam.memberCount} accounts. Everyone starts together when this combined first payment arrives, and it must come from your own bank account.`
                : `Family plan for ${fam.memberCount} accounts. You pay every member's 28-day bill from your own bank account.`}
            {fam.memberNames && fam.memberNames.length > 0 && ` In this family: ${fam.memberNames.join(", ")}.`}
            {fam.weeklyTime && ` Your weekly class together: ${fam.weeklyTime}.`}
          </p>
        )}
        {memberView && !fam.waitingForStart ? null : installment ? (
          <ZelleUnlockGate
            status={installment.status}
            rejectionReason={installment.rejectionReason}
            scaleCode={fam?.waitingForStart ? `First payment for ${fam.memberCount} accounts` : `Installment ${installment.installmentNumber ?? plan.installmentsPaid + 1} of ${plan.termMonths}`}
            scaleTitle={planLabel}
            eyebrowLabel={fam ? "Family plan" : "Payment Plan"}
            amountCents={installment.amountCents}
            zelleHandle={zelleHandle}
            paymentId={installment.id}
            onSubmitPayment={submitPlanInstallmentPaymentAction.bind(null, installment.id)}
          />
        ) : (
          // Between installments, on purpose: one Zelle payment a month is
          // the actual product, not "pay as many months as you want,
          // whenever you want," see getOrCreateOpenInstallmentPayment's own
          // comment. This is the normal, expected state for most of every
          // month, not an error.
          <div className="rounded-xl p-4 text-center bg-neu-base shadow-raised-low">
            <p className="text-small text-slate-100">You&apos;re all paid up for now.</p>
            {nextInstallmentDueDate && (
              <p className="mt-1 text-small text-slate-500">
                {`Your next installment opens for payment on ${new Date(nextInstallmentDueDate).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                })}.`}
              </p>
            )}
          </div>
        )}
        {!fam && !pendingSwitch && plan.installmentsPaid >= 1 && (
          <SwitchToFamilyPanel term={plan.term} pricing={pricing} onStarted={(payment, memberCount) => setPendingSwitch({ payment, memberCount })} />
        )}
        {familyBills.length > 0 && (
          <div className="mt-6 space-y-4">
            <p className="text-small font-medium text-slate-400">Other members&apos; 28-day bills</p>
            {familyBills.map((bill) => (
              <ZelleUnlockGate
                key={bill.payment.id}
                status={bill.payment.status}
                rejectionReason={bill.payment.rejectionReason}
                scaleCode={`${bill.memberName}: installment ${bill.payment.installmentNumber ?? "?"}`}
                scaleTitle={planLabel}
                eyebrowLabel="Family plan"
                amountCents={bill.payment.amountCents}
                zelleHandle={zelleHandle}
                paymentId={bill.payment.id}
                onSubmitPayment={submitPlanInstallmentPaymentAction.bind(null, bill.payment.id)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <NewPlanForm
      pricing={pricing}
      personalDiscountPercent={personalDiscountPercent}
      initialTerm={initialTerm}
      initialAudience={initialAudience}
      loadSlots={() => getReservableSlotsAction(cadence)}
      onStart={startPlan}
      checkMember={checkFamilyMemberAction}
      inviteApi={INVITE_API}
      loadWaitlist={getWaitlistAction}
      setWaitlist={(slot, join) => setWaitlistAction(slot.scheduleId, slot.chunkIndex, join)}
    />
  );
}

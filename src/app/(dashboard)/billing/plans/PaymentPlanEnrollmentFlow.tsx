"use client";

import { NumberTicker } from "@/components/ui/number-ticker";
import { useEffect, useMemo, useState } from "react";
import type { PaymentPlanCadence, PaymentPlanTerm, ZellePaymentStatus } from "@prisma/client";
import { calculateFamilyBundleTotal, MAX_FAMILY_BUNDLE_RECIPIENTS, calculatePaymentPlanRate, describePaymentPlan, discountedPlanPriceCents, type PricingConfig, CLASS_MINUTES, OFFERED_PLAN_CADENCE, PLAN_CADENCE_CREDITS_PER_WEEK } from "@/lib/classCreditPricing";
import type { ReservableSlot } from "@/lib/classSchedule";
import { ZelleUnlockGate } from "@/components/billing/ZelleUnlockGate";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { BookingCalendar } from "../../lessons/BookingCalendar";
import { SlideOverPanel } from "@/components/layout/SlideOverPanel";
import {
  confirmSwitchToFamilyAction,
  enrollFamilyPlanAction,
  enrollInPaymentPlanAction,
  getReservableSlotsAction,
  requestSwitchToFamilyCodeAction,
  submitPlanInstallmentPaymentAction,
} from "./actions";
import { Tabs } from "@/components/ui/Tabs";
import { SlotWaitlistPanel } from "./SlotWaitlistPanel";
import { buttonVariants } from "@/components/ui/button";

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "14:00" -> "2:00 PM", matches AdminScheduleManager.tsx's own formatTimeLabel, kept as its own small copy rather than a shared import across the admin/student boundary (same "duplicated on purpose" convention this codebase already uses for e.g. requireAdmin()). */
function formatTimeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/** Start time plus the plan's class length, e.g. "6:00 PM to 6:30 PM". */
function formatTimeRange(startHHmm: string, minutes: number): string {
  const [h, m] = startHHmm.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${formatTimeLabel(startHHmm)} to ${formatTimeLabel(`${Math.floor(total / 60) % 24}:${String(total % 60).padStart(2, "0")}`)}`;
}

/** The next `weeks` calendar dates (as UTC-midnight ms, the key BookingCalendar uses) that fall on `dayOfWeek`, starting today. */
function upcomingDatesFor(dayOfWeek: number, weeks: number): number[] {
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const ahead = (dayOfWeek - now.getDay() + 7) % 7;
  return Array.from({ length: weeks }, (_, i) => today + (ahead + i * 7) * 86_400_000);
}


const TERM_OPTIONS: { value: PaymentPlanTerm; label: string }[] = [
  { value: "MONTHLY", label: "4-Week" },
  { value: "TERM_3", label: "12-Week" },
  { value: "TERM_6", label: "24-Week" },
];

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
  /** Preselects the picker from a specific marketing-page tile (PaymentPlanTierGrid's ?cadence=&term= links) instead of always defaulting. */
  initialCadence?: PaymentPlanCadence;
  initialTerm?: PaymentPlanTerm;
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
  const price = calculateFamilyBundleTotal(OFFERED_PLAN_CADENCE, term, Math.max(2, typed.length + 1), pricing);
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
    const result = await confirmSwitchToFamilyAction(password, code, term, null, null, typed).catch(() => null);
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
          {emails.length < 3 && (
            <button type="button" onClick={() => setEmails((prev) => [...prev, ""])} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Add another person
            </button>
          )}
          <div className="rounded-control bg-neu-base p-3 text-small text-slate-300 shadow-pressed-low">
            <div className="flex justify-between"><span>Each person, every 4 weeks</span><span>{formatUsd(price.perStudentMonthlyCents)}</span></div>
            <div className="mt-1 flex justify-between font-semibold text-slate-50"><span>First payment, {Math.max(2, typed.length + 1)} people together</span><span>{formatUsd(price.perStudentMonthlyCents * Math.max(2, typed.length + 1))}</span></div>
          </div>
          <p className="text-small text-slate-400">To confirm, enter your password. We then email you a code.</p>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" aria-label="Your password" className={field} />
          {error && <p className="text-small text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={busy || typed.length === 0 || !password} onClick={sendCode} className={buttonVariants({ variant: "primary", size: "sm" })}>
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
  initialCadence,
  initialTerm,
  pricing,
  personalDiscountPercent = 0,
}: PaymentPlanEnrollmentFlowProps) {
  // One plan: a 45-minute class a week. (initialCadence from old links is ignored.)
  const cadence: PaymentPlanCadence = OFFERED_PLAN_CADENCE;
  const [term, setTerm] = useState<PaymentPlanTerm>(initialTerm ?? "TERM_6");
  const [slots, setSlots] = useState<ReservableSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<ReservableSlot | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [timesOpen, setTimesOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [audience, setAudience] = useState<"SOLO" | "FAMILY">("SOLO");
  const [pendingSwitch, setPendingSwitch] = useState(initialSwitch);
  const [memberEmails, setMemberEmails] = useState<string[]>([""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // installment is nullable now: an active plan can have nothing payable yet
  // (see nextInstallmentDueDate above), that's still "enrolled", just
  // between installments, not the picker below.
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

  const listRate = calculatePaymentPlanRate(cadence, term, pricing);
  const typedMembers = memberEmails.map((e) => e.trim()).filter(Boolean);
  const memberTotal = 1 + typedMembers.length;
  const familyPrice = calculateFamilyBundleTotal(cadence, term, Math.max(2, memberTotal), pricing);
  const isFamily = audience === "FAMILY";
  // The owner's personal discount applies to a solo plan (a family keeps the family rate): the same rule the server charges by.
  const personalOff = !isFamily && personalDiscountPercent > 0;
  const soloCents = personalOff ? discountedPlanPriceCents(listRate.installmentAmountCents, personalDiscountPercent) : listRate.installmentAmountCents;
  const baseRate = { ...listRate, installmentAmountCents: soloCents, totalCommittedCents: soloCents * listRate.termMonths };
  // A family member's monthly price is the family rate; everything else about the plan is the same.
  const rate = isFamily ? { ...baseRate, installmentAmountCents: familyPrice.perStudentMonthlyCents, totalCommittedCents: familyPrice.perStudentMonthlyCents * baseRate.termMonths } : baseRate;
  // Credits are internal bookkeeping now, by direct instruction: a student
  // never sees a raw credit count, just how many classes a month and how
  // long each one is. Both cadences work out to the same 4 classes a
  // month, they only differ in length, dividing creditsPerInstallment by
  // the cadence's own weekly cost (rather than hardcoding 4) keeps this
  // correct if the pricing table above it ever changes.
  const classesPerMonth = rate.creditsPerInstallment / PLAN_CADENCE_CREDITS_PER_WEEK[cadence];
  const classMinutes = CLASS_MINUTES;
  const termPhrase = rate.termMonths === 1 ? "these 4 weeks" : `your whole ${rate.termMonths * 4}-week term`;

  // A calendar like the class booking page: every open weekly time shows up
  // on the next few dates that fall on its weekday, so you pick a day you can
  // see, then a time. What you are really choosing is "every <weekday> at
  // <time>", locked in for the term; the dates are just a friendly way to
  // point at it.
  const calendarRows = useMemo(
    () => slots.flatMap((slot) => upcomingDatesFor(slot.dayOfWeek, 6).map((ms) => ({ occurrenceDateMs: ms, isBooked: false, slot }))),
    [slots],
  );
  const daySlots = useMemo(() => {
    if (!selectedDateKey) return [];
    const weekday = new Date(`${selectedDateKey}T00:00:00Z`).getUTCDay();
    return slots.filter((slot) => slot.dayOfWeek === weekday).sort((x, y) => x.startTime.localeCompare(y.startTime));
  }, [slots, selectedDateKey]);

  // Re-fetched whenever cadence changes (not term, a slot's room only
  // depends on the weekly credit cost, which is cadence-only, see
  // PLAN_CADENCE_CREDITS_PER_WEEK). Selection is cleared on change rather
  // than silently carried over, since the previous pick might not even be
  // in the new list.
  useEffect(() => {
    let cancelled = false;
    setSlotsLoading(true);
    setSelectedSlot(null);
    setSelectedDateKey(null);
    getReservableSlotsAction(cadence).then((result) => {
      if (!cancelled) {
        setSlots(result);
        setSlotsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [cadence]);

  async function handleEnrollFamily() {
    if (!selectedSlot) return;
    setLoading(true);
    setError(null);
    let result: Awaited<ReturnType<typeof enrollFamilyPlanAction>>;
    try {
      result = await enrollFamilyPlanAction(term, selectedSlot.scheduleId, selectedSlot.chunkIndex, typedMembers);
    } catch {
      setLoading(false);
      setError("Something went wrong starting the family plan. Please try again.");
      return;
    }
    setLoading(false);
    if (!result.ok || !result.planId || !result.startPaymentId || result.amountCents === null) {
      setError(result.error ?? "Something went wrong starting the family plan.");
      return;
    }
    setEnrolled({
      plan: { id: result.planId, cadence, term, installmentsPaid: 0, termMonths: rate.termMonths },
      installment: { id: result.startPaymentId, status: "AWAITING_TRANSFER", rejectionReason: null, amountCents: result.amountCents, installmentNumber: 1 },
      family: { isPayer: true, payerName: null, memberCount: result.memberCount, waitingForStart: true },
    });
  }

  async function handleEnroll() {
    if (isFamily) return handleEnrollFamily();
    if (!selectedSlot) return;
    setLoading(true);
    setError(null);
    let result: Awaited<ReturnType<typeof enrollInPaymentPlanAction>>;
    try {
      result = await enrollInPaymentPlanAction(cadence, term, selectedSlot.scheduleId, selectedSlot.chunkIndex);
    } catch {
      setLoading(false);
      setError("Something went wrong starting your plan. Please try again.");
      return;
    }
    setLoading(false);
    if (!result.ok || !result.planId || !result.installmentPaymentId || result.amountCents === null) {
      setError(result.error ?? "Something went wrong starting your plan.");
      return;
    }
    setEnrolled({
      plan: { id: result.planId, cadence, term, installmentsPaid: 0, termMonths: rate.termMonths },
      installment: {
        id: result.installmentPaymentId,
        status: "AWAITING_TRANSFER",
        rejectionReason: null,
        amountCents: result.amountCents,
        installmentNumber: 1,
      },
    });
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
                : `This is a family plan for ${fam.memberCount} accounts. ${fam.payerName ?? "The person who set it up"} pays your 4-week bill from their own bank account.`
              : fam.waitingForStart
                ? `Family plan for ${fam.memberCount} accounts. Everyone starts together when this combined first payment arrives, and it must come from your own bank account.`
                : `Family plan for ${fam.memberCount} accounts. You pay every member's 4-week bill from your own bank account.`}
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
            <p className="text-small font-medium text-slate-400">Other members&apos; 4-week bills</p>
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
    <div className="space-y-6">
      <Tabs
        label="Who is this plan for?"
        items={[
          { id: "SOLO", label: "Just me" },
          { id: "FAMILY", label: "Me and my family" },
        ]}
        value={audience}
        onChange={(next) => {
          setAudience(next);
          setError(null);
        }}
      />

      {isFamily && (
        <div className="rounded-xl bg-neu-base p-4 shadow-raised-low">
          <p className="text-small font-semibold text-slate-50">Who is in the family?</p>
          <p className="mt-1 text-small text-slate-400">
            Each person needs their own Bass Note Piano account first, with their own name. You pay for everyone from your own bank
            account: one combined first payment starts everyone together, then each person has their own 4-week bill. If anyone
            cannot start, nobody does.
          </p>
          <div className="mt-3 space-y-2">
            {memberEmails.map((email, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setMemberEmails((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                  placeholder="Family member's account email"
                  aria-label={`Family member ${i + 1} email`}
                  className="h-11 min-w-0 flex-1 rounded-control bg-neu-base px-4 text-body text-slate-100 shadow-pressed-low outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                {memberEmails.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setMemberEmails((prev) => prev.filter((_, j) => j !== i))}
                    className={buttonVariants({ variant: "secondary", size: "sm" })}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          {memberEmails.length < Math.min(3, MAX_FAMILY_BUNDLE_RECIPIENTS - 1) && (
            <button type="button" onClick={() => setMemberEmails((prev) => [...prev, ""])} className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-3" })}>
              Add another person
            </button>
          )}
        </div>
      )}

      <div>
        <p className="mb-2 text-small font-medium text-slate-400">Term</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TERM_OPTIONS.map((option) => {
            const active = term === option.value;
            // Off the Monthly rate, from the real (rounded) prices, so the badge can't disagree with them.
            const percentOff = Math.round(
              (1 - calculatePaymentPlanRate(cadence, option.value, pricing).installmentAmountCents / calculatePaymentPlanRate(cadence, "MONTHLY", pricing).installmentAmountCents) * 100,
            );
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setTerm(option.value)}
                aria-pressed={active}
                className={`tap rounded-control bg-neu-base px-3 py-3 text-center transition ${
                  active ? "shadow-pressed-low" : "shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                }`}
              >
                <p className={`text-small font-medium ${active ? "text-signal-fg" : "text-slate-100"}`}>{option.label}</p>
                <p className="mt-0.5 text-small text-slate-500">
                  {percentOff > 0 ? (
                    <>
                      −<NumberTicker value={percentOff} />%
                    </>
                  ) : (
                    "No commitment"
                  )}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-3 text-small font-medium text-slate-400">Your weekly time</p>
        {slotsLoading ? (
          <div className="flex items-center justify-center rounded-lg py-6 bg-neu-base shadow-raised-low">
            <MorphingSquare size={16} />
          </div>
        ) : slots.length === 0 ? (
          <p className="rounded-lg px-3.5 py-3 text-small text-slate-500 bg-neu-base shadow-raised-low">
            No open weekly times right now.
          </p>
        ) : (
          <>
            <BookingCalendar
              occurrences={calendarRows}
              selectedDateKey={selectedDateKey}
              onSelectDate={(key) => {
                // Tapping the picked day again reopens its times instead of clearing it.
                if (key === null && selectedDateKey) {
                  setTimesOpen(true);
                  return;
                }
                setSelectedDateKey(key);
                setSelectedSlot(null);
                if (key) setTimesOpen(true);
              }}
            />
            {!selectedSlot && <p className="mt-4 text-small text-slate-500">Pick a day.</p>}
            <SlideOverPanel
              open={timesOpen && !!selectedDateKey}
              onClose={() => setTimesOpen(false)}
              title={
                selectedDateKey
                  ? new Date(`${selectedDateKey}T00:00:00Z`).toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      timeZone: "UTC",
                    })
                  : "Pick a time"
              }
            >
              <div className="grid grid-cols-2 gap-3 p-4">
                {daySlots.map((slot) => {
                  const active = selectedSlot?.scheduleId === slot.scheduleId && selectedSlot?.chunkIndex === slot.chunkIndex;
                  return (
                    <button
                      key={`${slot.scheduleId}:${slot.chunkIndex}`}
                      type="button"
                      onClick={() => {
                        setSelectedSlot(slot);
                        setTimesOpen(false);
                      }}
                      aria-pressed={active}
                      className={`tap flex min-h-20 flex-col items-center justify-center gap-1 rounded-control px-3 py-3 text-center transition bg-neu-base ${
                        active ? "shadow-pressed-low" : "shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                      }`}
                    >
                      <span className={`text-body font-semibold ${active ? "text-signal-fg" : "text-slate-100"}`}>
                        {formatTimeRange(slot.startTime, classMinutes)}
                      </span>
                      <span className="text-small text-slate-500">{active ? "Selected" : slot.label ?? `${classMinutes} min`}</span>
                    </button>
                  );
                })}
              </div>
            </SlideOverPanel>
            {selectedSlot && (
              <p className="mt-3 rounded-xl bg-neu-base px-3.5 py-3 text-small text-slate-300 shadow-pressed-low">
                Locked in every <span className="font-semibold text-slate-50">{DAY_LABELS[selectedSlot.dayOfWeek]}</span> at{" "}
                <span className="font-semibold text-slate-50">{formatTimeRange(selectedSlot.startTime, classMinutes)}</span>{" "}
                for {termPhrase}.
              </p>
            )}
          </>
        )}
        <SlotWaitlistPanel />
      </div>

      <div className="rounded-xl p-4 sm:p-5 bg-neu-base shadow-raised-low">
        <div className="flex items-center justify-between text-small text-slate-400">
          <span>
            <NumberTicker value={rate.installmentAmountCents} format={formatUsd} />
            {rate.termMonths === 1 ? (
              ", 4 weeks"
            ) : (
              <>
                /4 weeks × <NumberTicker value={rate.termMonths} /> payments
              </>
            )}
          </span>
          <NumberTicker value={rate.totalCommittedCents} format={formatUsd} />
        </div>
        {personalOff && (
          <div className="mt-1 flex items-center justify-between text-small text-signal">
            <span>Your discount, {personalDiscountPercent}% off</span>
            <span>
              <span className="mr-2 text-slate-500 line-through">{formatUsd(listRate.installmentAmountCents)}</span>
              {formatUsd(rate.installmentAmountCents)}
            </span>
          </div>
        )}
        <div className="mt-2 flex items-center justify-between border-t border-ink/10 pt-2 text-body font-semibold text-slate-50">
          <span>{isFamily ? "Each person, every 4 weeks" : rate.termMonths === 1 ? "Due now" : "Due every 4 weeks"}</span>
          <NumberTicker value={rate.installmentAmountCents} format={formatUsd} />
        </div>
        {isFamily && (
          <div className="mt-1 flex items-center justify-between text-small text-slate-300">
            <span>First payment, all {Math.max(2, memberTotal)} people together</span>
            <NumberTicker value={rate.installmentAmountCents * Math.max(2, memberTotal)} format={formatUsd} />
          </div>
        )}
        <div className="mt-1 flex items-center justify-between text-small text-slate-500">
          <span>{classMinutes}-min classes</span>
          <span>
            <NumberTicker value={classesPerMonth} /> classes every 4 weeks
            {rate.termMonths > 1 && (
              <>
                {" "}
                · <NumberTicker value={classesPerMonth * rate.termMonths} /> total over <NumberTicker value={rate.termMonths * 4} /> weeks
              </>
            )}
          </span>
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-[rgb(var(--c-s-50)/0.2)] bg-[rgb(var(--c-s-50)/0.05)] p-3.5 text-small text-slate-300">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-ink/10 bg-slate-950 accent-[rgb(var(--c-s-50))]"
        />
        <span>
          {rate.termMonths === 1 ? (
            <>
              I&apos;m paying for 4 weeks (<NumberTicker value={rate.installmentAmountCents} format={formatUsd} />), no further commitment.
            </>
          ) : (
            <>
              I&apos;m committing to <NumberTicker value={rate.termMonths} /> installments, one every 4 weeks, of{" "}
              <NumberTicker value={rate.installmentAmountCents} format={formatUsd} /> each.
            </>
          )}{" "}
          My selected weekly time is reserved for me exclusively and auto-booked automatically every week this
          plan stays active, I don&apos;t need to book it myself. If a specific week doesn&apos;t work for me, I&apos;ll
          message support rather than rescheduling it myself. Money spent is{" "}
          <span className="font-medium text-[rgb(var(--c-s-50))]">non-refundable</span> once a class happens.
        </span>
      </label>

      {error && <p className="text-small text-red-400">{error}</p>}

      <button
        type="button"
        onClick={handleEnroll}
        disabled={loading || !acknowledged || !selectedSlot || (isFamily && typedMembers.length === 0)}
        className={buttonVariants({ variant: "primary", className: "flex w-full" })}
      >
        {loading && <MorphingSquare size={14} className="mr-2 shrink-0" />}
        {loading ? "Starting…" : isFamily ? "Start family plan" : "Start plan"}
      </button>
    </div>
  );
}

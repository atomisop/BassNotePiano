"use client";

import { SwitchLook } from "@/components/ui/switch";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { X } from "@/components/ui/appIcons";
import type { PaymentPlanTerm } from "@prisma/client";
import { CLASS_MINUTES, discountPercentForTerm, MAX_FAMILY_MEMBERS, OFFERED_PLAN_CADENCE, describePaymentPlan, type PricingConfig } from "@/lib/classCreditPricing";
import type { ReservableSlot } from "@/lib/classSchedule";
import { checkoutTotals, headcount, missingForCheckout, parentHeadcount, parentTimeHolders, type Audience } from "@/lib/planCheckout";
import { DAY_NAMES, formatTimeRange } from "@/lib/weeklyTimeLabels";
import { useFamilyInvites, type FamilyInviteApi } from "@/components/billing/useFamilyInvites";
import { AccountCheckLine, type CheckState } from "@/components/billing/AccountCheckLine";
import { looksLikeEmail } from "@/lib/familyMemberCheck";
import { CheckoutBar } from "@/components/billing/CheckoutBar";
import { WeekdayTimePicker } from "@/components/billing/WeekdayTimePicker";
import { Dialog } from "@/components/ui/Dialog";
import { Hint } from "@/components/ui/Hint";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Tabs } from "@/components/ui/Tabs";
import { tierLook, tierVars } from "@/components/marketing/PaymentPlanTierGrid";
import { buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/Toaster";
import { RollingNumber } from "@/components/ui/RollingNumber";
import { cn } from "@/lib/utils";

const TERM_OPTIONS: { value: PaymentPlanTerm; label: string }[] = [
  { value: "MONTHLY", label: "1 Month" },
  { value: "TERM_3", label: "3 Months" },
  { value: "TERM_6", label: "6 Months" },
];

function usd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}


const field =
  "h-11 min-w-0 flex-1 rounded-control bg-neu-base px-4 text-body text-slate-100 shadow-pressed-low outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-ring";

export type StartPlanResult = { ok: true } | { ok: false; error: string };

export interface StartPlanInput {
  audience: Audience;
  term: PaymentPlanTerm;
  /** The weekly time for a solo or group plan (null in parent mode, where everyone has their own in `personSlots`). */
  slot: ReservableSlot | null;
  /** Parent mode: each person's own weekly time, keyed by their email (lowercased) or "self" for the parent. */
  personSlots: { key: string; slot: ReservableSlot }[];
  /** Every group member's account email, in the order typed (empty for a solo plan). */
  memberEmails: string[];
  /** The first payment on screen when they pressed Start; the server refuses if the real price is different. */
  expectedFirstPaymentCents: number;
  /** "PARENT": a parent paying for the children they linked (memberEmails are the children). */
  mode: "GROUP" | "PARENT";
  /** Parent mode only: the parent learns too, on a plan of their own at the same price. */
  includeSelf: boolean;
}

/** What parent mode needs from the page: how to ask a child to link, and whether the parent can add themselves (not while they have a plan). */
export interface ParentModeConfig {
  inviteApi: FamilyInviteApi;
  canIncludeSelf: boolean;
  /** Open already in parent mode (the pricing or Parent page sent them here). */
  startOn?: boolean;
  /** Only parent mode: no "Just me" and no group choice (opened from the Parent page). */
  only?: boolean;
}

/**
 * Starting a plan: who it is for, how long, who is in the family, and the weekly time, in that order, then the price and the Review
 * button as the last thing on the page. On a tablet or computer the plan and people sit beside the weekly times. A plan the pricing page linked to arrives with its length and "just me" or "family"
 * already chosen, so the only thing left is the time. The server calls live in the parent (`onStart`, `loadSlots`), which keeps this
 * screen about the form and lets it be tried with made-up times.
 */
export function NewPlanForm({
  pricing,
  personalDiscountPercent = 0,
  scholarshipPercent = 0,
  initialTerm,
  initialAudience = "SOLO",
  loadSlots,
  onStart,
  loadWaitlist,
  setWaitlist,
  checkMember,
  inviteApi,
  parent,
  initialSlotKey = null,
  initialMembers,
  onClaimScholarship,
}: {
  pricing: PricingConfig;
  personalDiscountPercent?: number;
  scholarshipPercent?: number;
  initialTerm?: PaymentPlanTerm;
  initialAudience?: Audience;
  /** A weekly time already picked elsewhere ("scheduleId:chunkIndex", ?slot=): chosen as soon as the open times load. */
  initialSlotKey?: string | null;
  /** People already on the form (?child= from Parent mode). */
  initialMembers?: string[];
  /** Claims a scholarship code right here (the 6 Month card). Leave out to hide "Have a scholarship code?". */
  onClaimScholarship?: (code: string) => Promise<{ ok: true; percent: number } | { ok: false; error: string }>;
  loadSlots: () => Promise<ReservableSlot[]>;
  onStart: (input: StartPlanInput) => Promise<StartPlanResult>;
  /** Times other students hold, and the ones this person is waiting for. Leave both out to hide waiting for a time. */
  loadWaitlist?: () => Promise<{ taken: ReservableSlot[]; mine: string[] }>;
  setWaitlist?: (slot: ReservableSlot, join: boolean) => Promise<{ ok: boolean; error: string | null }>;
  /** Asks the server whether an email is an account that can join. Leave out to skip the live check. */
  /** Invitations: a group member must accept before the plan can start. Leave out to skip (no gate). */
  inviteApi?: FamilyInviteApi;
  checkMember?: (email: string) => Promise<Exclude<CheckState, "checking" | "duplicate" | "failed">>;
  /** Parent mode: a button in the people area switches the plan to one a parent pays for their linked children. Leave out to hide it. */
  parent?: ParentModeConfig;
}) {
  const cadence = OFFERED_PLAN_CADENCE;
  const [audience, setAudience] = useState<Audience>(parent?.only || parent?.startOn ? "FAMILY" : initialAudience);
  // The switch itself updates at once; the heavy re-render of cards, totals and the people list follows without blocking the next tap.
  const [tabAudience, setTabAudience] = useState<Audience>(audience);
  const [, startAudienceTransition] = useTransition();
  const [parentMode, setParentMode] = useState(Boolean(parent?.only || parent?.startOn));
  // The parent learns too unless they take themselves out (or already have a plan of their own).
  const [includeSelf, setIncludeSelf] = useState(Boolean(parent?.canIncludeSelf));
  const [term, setTerm] = useState<PaymentPlanTerm>(initialTerm ?? "TERM_6");
  const [memberRows, setMemberRows] = useState<string[]>(initialMembers && initialMembers.length > 0 ? initialMembers : [""]);
  // A scholarship claimed here prices the 6 Month plan at once (the server already saved it).
  const [scholarship, setScholarship] = useState(scholarshipPercent);
  useEffect(() => setScholarship(scholarshipPercent), [scholarshipPercent]);
  const [slots, setSlots] = useState<ReservableSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [slot, setSlot] = useState<ReservableSlot | null>(null);
  // Parent mode: every person on the plan picks their own weekly time.
  const [personTimes, setPersonTimes] = useState<Record<string, ReservableSlot>>({});
  const [activeHolder, setActiveHolder] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusRow, setFocusRow] = useState<number | null>(null);
  const [wait, setWait] = useState<{ taken: ReservableSlot[]; mine: string[] }>({ taken: [], mine: [] });
  const [waitBusy, setWaitBusy] = useState<string | null>(null);
  const [waitError, setWaitError] = useState<string | null>(null);
  const rowRefs = useRef<(HTMLInputElement | null)[]>([]);
  // ?slot= asked for a time that is no longer open: say so above the times instead of quietly picking nothing.
  const [slotGone, setSlotGone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadSlots()
      .then((result) => {
        if (cancelled) return;
        setSlots(result);
        if (!initialSlotKey) return;
        // The time picked elsewhere (Lessons, a "your time is open" notice) is chosen here too, so it is not picked twice.
        const picked = result.find((s) => `${s.scheduleId}:${s.chunkIndex}` === initialSlotKey);
        if (!picked) return setSlotGone(true);
        const firstChild = initialMembers?.[0]?.trim().toLowerCase();
        if (parent?.only && firstChild) setPersonTimes({ [firstChild]: picked });
        else setSlot(picked);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Loaded once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loadWaitlist) return;
    let cancelled = false;
    loadWaitlist()
      .then((result) => {
        if (!cancelled) setWait(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Loaded once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleWait(target: ReservableSlot, join: boolean) {
    if (!setWaitlist) return;
    const key = `${target.scheduleId}:${target.chunkIndex}`;
    setWaitBusy(key);
    setWaitError(null);
    const result = await setWaitlist(target, join).catch(() => ({ ok: false, error: "Something went wrong. Please try again." }));
    if (!result.ok) setWaitError(result.error);
    else setWait((w) => ({ ...w, mine: join ? [...w.mine, key] : w.mine.filter((k) => k !== key) }));
    setWaitBusy(null);
  }

  // Each typed email is looked up once it stops changing; answers are kept so retyping the same one is instant.
  const [lookups, setLookups] = useState<Record<string, CheckState>>({});
  const asked = useRef(new Set<string>());
  const groupInvites = useFamilyInvites(inviteApi, audience === "FAMILY" && !parentMode, term);
  const parentInvites = useFamilyInvites(parent?.inviteApi, audience === "FAMILY" && parentMode);
  const invites = parentMode && parent ? parentInvites : groupInvites;
  const gated = parentMode && parent ? true : Boolean(inviteApi);
  // Invitations survive a reload: the people already asked come back into the list.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !invites.loaded) return;
    restored.current = true;
    // Parent mode offers the linked children as one-tap choices below instead of filling the list with all of them.
    if (parentMode && parent) return;
    const emails = Object.keys(invites.status).filter((e) => invites.status[e] !== "SENDING");
    if (emails.length > 0 && memberRows.every((r) => r.trim() === "")) setMemberRows(emails);
  }, [invites.loaded, invites.status, memberRows, parentMode, parent]);
  useEffect(() => {
    if (!checkMember || audience !== "FAMILY") return;
    const wanted = memberRows.map((r) => r.trim().toLowerCase()).filter((e) => looksLikeEmail(e) && !asked.current.has(e));
    if (wanted.length === 0) return;
    const timer = window.setTimeout(() => {
      for (const email of new Set(wanted)) {
        asked.current.add(email);
        setLookups((l) => ({ ...l, [email]: "checking" }));
        checkMember(email)
          .then((answer) => {
            if (answer === "limited") asked.current.delete(email);
            setLookups((l) => ({ ...l, [email]: answer }));
          })
          .catch(() => {
            asked.current.delete(email);
            setLookups((l) => ({ ...l, [email]: "failed" }));
          });
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [memberRows, audience, checkMember]);

  function stateFor(i: number): CheckState | null {
    const email = memberRows[i].trim().toLowerCase();
    if (!email || !checkMember) return null;
    if (!looksLikeEmail(email)) return null;
    if (memberRows.slice(0, i).some((r) => r.trim().toLowerCase() === email)) return "duplicate";
    const found = lookups[email] ?? "checking";
    if (found !== "ready" || !gated) return found;
    const inv = invites.status[email];
    return inv === "SENDING" ? "sending" : inv === "PENDING" ? "waiting" : inv === "ACCEPTED" ? "accepted" : inv === "DECLINED" ? "declined" : "ready";
  }

  // A row just added takes the cursor, so adding a person and typing their email is one motion.
  useEffect(() => {
    if (focusRow === null) return;
    rowRefs.current[focusRow]?.focus();
    setFocusRow(null);
  }, [focusRow, memberRows.length]);

  const isFamily = audience === "FAMILY";
  const isParent = isFamily && parentMode && Boolean(parent);
  const people = isParent ? parentHeadcount(memberRows, includeSelf) : headcount(memberRows);
  const parentTotals = isParent ? { includeSelf } : undefined;
  // The discount the chosen length actually gets (a scholarship only counts on the 6 Month plan).
  const termDiscount = discountPercentForTerm({ percent: personalDiscountPercent, scholarshipPercent: scholarship }, term);
  const totals = useMemo(
    () => checkoutTotals({ cadence, term, pricing, audience, memberRows, personalDiscountPercent, scholarshipPercent: scholarship, parent: parentTotals }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cadence, term, pricing, audience, memberRows, personalDiscountPercent, scholarship, isParent, includeSelf],
  );
  const rowStates = isFamily ? memberRows.map((_, i) => stateFor(i)) : [];
  const good = (st: CheckState | null) => st === "accepted" || (!gated && st === "ready");
  const toInvite = gated ? memberRows.filter((_, i) => rowStates[i] === "ready").map((r) => r.trim()) : [];
  const accountHint = rowStates.includes("checking")
    ? "Checking the accounts"
    : rowStates.some((st) => st === "sending" || st === "waiting")
      ? "Waiting for them to accept"
      : toInvite.length > 0
        ? "Send the invitations first"
        : rowStates.some((st) => st !== null && !good(st))
          ? "Fix the marked email"
          : null;
  // Parent mode: whose times are needed, which one is being picked, and which times the others already took (one person per time).
  const holders = isParent ? parentTimeHolders(memberRows, includeSelf) : [];
  const keyOf = (t: ReservableSlot) => `${t.scheduleId}:${t.chunkIndex}`;
  const timeOf = (holderKey: string) => {
    const t = personTimes[holderKey];
    // A time that has since gone (taken by someone else, reloaded) no longer counts.
    return t && slots.some((open) => keyOf(open) === keyOf(t)) ? t : null;
  };
  const current = holders.find((h) => h.key === activeHolder) ?? holders.find((h) => !timeOf(h.key)) ?? holders[0] ?? null;
  const takenByOthers = new Set(holders.filter((h) => h.key !== current?.key).map((h) => timeOf(h.key)).filter((t): t is ReservableSlot => t !== null).map(keyOf));
  const allTimesPicked = holders.length > 0 && holders.every((h) => timeOf(h.key) !== null);

  function pickFor(holderKey: string, picked: ReservableSlot | null) {
    setPersonTimes((prev) => {
      const next = { ...prev };
      if (picked) next[holderKey] = picked;
      else delete next[holderKey];
      return next;
    });
    // Straight on to the next person still without a time.
    if (picked) setActiveHolder(holders.find((h) => h.key !== holderKey && !timeOf(h.key))?.key ?? holderKey);
  }

  // In the order the page asks: the people, their yes, then the time.
  const missing = missingForCheckout({ audience, memberRows, slotChosen: isParent ? allTimesPicked : slot !== null, parent: isParent });
  const timeMissing = missing === "Pick a weekly time" ? (isParent ? "Pick a weekly time for each person" : missing) : null;
  const hint = (timeMissing ? null : missing) ?? accountHint ?? timeMissing;
  const planName = describePaymentPlan(cadence, term).replace(/, .*/, "");
  const classesTotal = totals.classesPerPayment * totals.payments;
  const timeLine = slot ? `${DAY_NAMES[slot.dayOfWeek]}s, ${formatTimeRange(slot.startTime, CLASS_MINUTES)}` : null;

  const barNote = isFamily ? "first payment" : totals.payments === 1 ? "for 28 days" : "every 28 days";
  // The whole plan, so a 3 or 6 month plan shows what it adds up to before anyone starts.
  const barTotal = totals.payments > 1 ? `Whole plan: ${usd(totals.allPeopleTermCents)} over ${totals.payments} payments (${totals.payments * 28} days)` : null;

  async function start() {
    if (hint !== null || (!isParent && !slot)) return;
    setBusy(true);
    setError(null);
    const personSlots = isParent ? holders.map((h) => ({ key: h.key, slot: timeOf(h.key)! })) : [];
    const result = await onStart({ audience, term, slot: isParent ? null : slot, personSlots, memberEmails: isFamily ? memberRows.map((r) => r.trim()).filter(Boolean) : [], expectedFirstPaymentCents: totals.firstPaymentCents, mode: isParent ? "PARENT" : "GROUP", includeSelf: isParent && includeSelf }).catch(
      (): StartPlanResult => ({ ok: false, error: "Something went wrong. Please try again." }),
    );
    setBusy(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <div className="space-y-6 md:space-y-8">
      {!parent?.only && (
      <div className="flex justify-center md:justify-start">
      <Tabs
        label="Who is this plan for?"
        items={[
          { id: "SOLO", label: "Just me" },
          { id: "FAMILY", label: "Me and others" },
        ]}
        value={tabAudience}
        onChange={(next) => {
          setTabAudience(next);
          startAudienceTransition(() => {
            setAudience(next);
            setError(null);
          });
        }}
      />
      </div>
      )}

      {/* The plan length: three plain cards with just the price, in the plan colours (they fade to the group colours with the switch). */}
      <div aria-hidden className="tier-wash" style={{ opacity: audience === "FAMILY" ? 1 : 0 }} />
      <div>
        <p className="mb-3 px-1 text-caption font-medium uppercase tracking-caps text-slate-500">Plan length</p>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {TERM_OPTIONS.map((option) => {
            const active = term === option.value;
            const t = checkoutTotals({ cadence, term: option.value, pricing, audience, memberRows, personalDiscountPercent, scholarshipPercent: scholarship, parent: parentTotals });
            const off = Math.round((1 - t.perPaymentCents / checkoutTotals({ cadence, term: "MONTHLY", pricing, audience, memberRows, personalDiscountPercent, scholarshipPercent: scholarship, parent: parentTotals }).perPaymentCents) * 100);
            const look = tierLook(option.value);
            const who = audience === "FAMILY" ? look.family : look.solo;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setTerm(option.value)}
                aria-pressed={active}
                style={tierVars(who)}
                className={`tap relative isolate overflow-hidden rounded-control border border-ink/10 bg-neu-base px-2 py-3 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active ? "ring-2 ring-[var(--tier-accent)]" : "opacity-90 hover:opacity-100"
                }`}
              >
                {(["solo", "family"] as const).map((k) => (
                  <span
                    key={k}
                    aria-hidden
                    style={tierVars(look[k])}
                    className={`tier-layer tier-card pointer-events-none absolute inset-0 -z-10 ${(k === "family") === (audience === "FAMILY") ? "opacity-100" : "opacity-0"}`}
                  />
                ))}
                <span className="tier-accent block text-caption font-bold uppercase tracking-wide">{look.tag}</span>
                <span className="mt-0.5 block text-small font-semibold text-slate-100">{option.label}</span>
                <span className="tier-price mt-0.5 block text-body font-semibold tabular-nums">{usd(t.perPaymentCents)}</span>
                <span className="block text-small text-slate-400">{off > 0 ? `every 28 days, −${off}%` : "every 28 days"}</span>
              </button>
            );
          })}
        </div>
        {/* A scholarship only prices the 6 Month plan, so its code is entered right under that card and the price changes here. */}
        {onClaimScholarship && !isFamily && scholarship === 0 && (
          <ScholarshipClaim
            onClaim={onClaimScholarship}
            onClaimed={(percent) => {
              setScholarship(percent);
              setTerm("TERM_6");
            }}
          />
        )}
      </div>

      {/* Tablets and computers: the people on the left, the weekly times on the right. Phones, and a plan for one person (which
          has no people to list): one column, so the times never sit beside an empty half. */}
      <div className={cn("grid grid-cols-1 gap-6 md:items-start md:gap-8", isFamily && "md:grid-cols-2")}>
      <div className={cn("space-y-6", !isFamily && "hidden")}>
      {isFamily && (
        <section aria-label="People on this plan" className="rounded-card bg-neu-base p-4 shadow-raised-low md:p-5">
          {parent && !parent.only && (
            <div className="mb-4 flex items-center gap-2">
              {/* The same one-track switch as "Just me / Me and others": one highlight, so it is always clear which kind is on. */}
              <Tabs
                label="Kind of plan"
                items={[
                  { id: "GROUP", label: "Group" },
                  { id: "PARENT", label: "Parent mode" },
                ]}
                value={parentMode ? "PARENT" : "GROUP"}
                onChange={(next) => setParentMode(next === "PARENT")}
              />
              <Hint>Group: you hold the one weekly class time, and everyone else books their own. Parent mode: the weekly time is your child&apos;s, and you can see and change their schedule from your account.</Hint>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-small font-semibold text-slate-50">{isParent ? "Which children?" : "Who is in the group?"}</p>
            <p className="text-small tabular-nums text-slate-300" aria-live="polite">
              <NumberTicker value={people.people} /> of {MAX_FAMILY_MEMBERS} people
            </p>
          </div>
          {isParent && (
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Your linked children">
              {Object.entries(parentInvites.status)
                .filter(([email, st]) => st === "ACCEPTED" && !memberRows.some((r) => r.trim().toLowerCase() === email))
                .map(([email]) => (
                  <button
                    key={email}
                    type="button"
                    onClick={() => setMemberRows((prev) => (prev.length === 1 && prev[0].trim() === "" ? [email] : [...prev, email]))}
                    className="tap rounded-full bg-slate-50/6 px-3.5 py-1.5 text-small text-slate-300 transition hover:text-slate-50"
                  >
                    + {email}
                  </button>
                ))}
            </div>
          )}
          <ul className="mt-3 space-y-2">
            {isParent ? (
              <li className="flex min-h-11 items-center justify-between gap-3 rounded-control bg-neu-lift px-4 py-1.5 text-small text-slate-300 shadow-pressed-low">
                <span className="font-medium text-slate-100">You pay</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={includeSelf}
                  disabled={!parent?.canIncludeSelf}
                  title={parent?.canIncludeSelf ? undefined : "You already have your own plan"}
                  onClick={() => setIncludeSelf((v) => !v)}
                  className="tap flex items-center gap-2 rounded-full text-slate-200 disabled:opacity-50"
                >
                  <span>{includeSelf ? "I'm learning too" : "Just for them"}</span>
                  <SwitchLook on={includeSelf} />
                </button>
              </li>
            ) : (
              <li className="flex h-11 items-center justify-between rounded-control bg-neu-lift px-4 text-small text-slate-300 shadow-pressed-low">
                <span className="font-medium text-slate-100">You</span>
                <span>pays for everyone</span>
              </li>
            )}
            {memberRows.map((email, i) => (
              <li key={i}>
                <div className="flex gap-2">
                <input
                  ref={(el) => {
                    rowRefs.current[i] = el;
                  }}
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setMemberRows((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                  placeholder={isParent ? "Your child's account email" : "Their account email"}
                  aria-label={isParent ? `Child ${i + 1} email` : `Group member ${i + 1} email`}
                  className={field}
                />
                {memberRows.length > 1 && (
                  <button
                    type="button"
                    aria-label={isParent ? `Remove child ${i + 1}` : `Remove group member ${i + 1}`}
                    onClick={() => {
                      invites.cancel(email);
                      setMemberRows((prev) => prev.filter((_, j) => j !== i));
                    }}
                    className="tap flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-neu-base text-slate-300 shadow-raised-low active:shadow-pressed-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X aria-hidden className="h-4 w-4" />
                  </button>
                )}
                </div>
                <AccountCheckLine state={stateFor(i)} email={email.trim()} />
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={!people.canAdd}
            onClick={() => {
              setMemberRows((prev) => [...prev, ""]);
              setFocusRow(memberRows.length);
            }}
            className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-3" })}
          >
            {isParent ? "Add another child" : "Add another person"}
          </button>
          {toInvite.length > 0 && (
            <button type="button" onClick={() => void invites.send(toInvite)} className={buttonVariants({ variant: "secondary", size: "sm", className: "ml-2 mt-3" })}>
              {isParent ? (toInvite.length === 1 ? "Send request" : `Send ${toInvite.length} requests`) : toInvite.length === 1 ? "Send invitation" : `Send ${toInvite.length} invitations`}
            </button>
          )}
          {invites.error && (
            <p role="alert" className="mt-2 text-small text-red-400">
              {invites.error}
            </p>
          )}
          {people.atMax && <p className="mt-2 text-small text-slate-500">That is the most one group plan holds ({MAX_FAMILY_MEMBERS} people).</p>}
        </section>
      )}

      </div>

      <div>
        <p className="mb-3 px-1 text-caption font-medium uppercase tracking-caps text-slate-500">{isParent ? "Weekly times, one for each person" : isFamily ? "Your weekly time (only you)" : "Your weekly time"}</p>
        {slotGone && (
          <p role="status" className="mb-2 text-small text-amber-300">
            The time you picked was just taken. Pick another one below.
          </p>
        )}
        {isParent && (
          <div className="mb-3 space-y-2" role="group" aria-label="Whose weekly time">
            {holders.length === 0 ? (
              <p className="rounded-control bg-neu-base px-4 py-3 text-small text-slate-500 shadow-pressed-low"><Hint>Add a child above, then pick a time for each person.</Hint></p>
            ) : (
              holders.map((h) => {
                const t = timeOf(h.key);
                const on = current?.key === h.key;
                return (
                  <button
                    key={h.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setActiveHolder(h.key)}
                    className={cn(
                      "tap flex w-full items-center justify-between gap-3 rounded-control px-4 py-2.5 text-left text-small transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on ? "bg-neu-lift text-slate-50 ring-1 ring-signal" : "bg-neu-base text-slate-300 hover:bg-neu-lift",
                    )}
                  >
                    <span className="min-w-0 truncate font-medium">{h.label}</span>
                    <span className={cn("shrink-0 tabular-nums", t ? "text-slate-100" : "text-slate-500")}>
                      {t ? `${DAY_NAMES[t.dayOfWeek]}s, ${formatTimeRange(t.startTime, CLASS_MINUTES)}` : on ? "Pick below" : "No time yet"}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
        {isParent && holders.length === 0 ? null : slotsLoading ? (
          <div className="flex items-center justify-center rounded-lg bg-neu-base py-6 shadow-raised-low">
            <MorphingSquare size={16} />
          </div>
        ) : slots.length === 0 && wait.taken.length === 0 ? (
          <p className="rounded-lg bg-neu-base px-3.5 py-3 text-small text-slate-500 shadow-raised-low"><Hint>No open weekly times right now.</Hint></p>
        ) : (
          <>
            {isParent && current && <p className="mb-2 text-small text-slate-400">Time for <span className="font-medium text-slate-100">{current.label}</span></p>}
            <WeekdayTimePicker
              slots={isParent ? slots.filter((open) => !takenByOthers.has(keyOf(open))) : slots}
              selected={isParent ? (current ? timeOf(current.key) : null) : slot}
              onSelect={isParent ? (picked) => current && pickFor(current.key, picked) : setSlot}
              taken={wait.taken}
              waiting={wait.mine}
              busyKey={waitBusy}
              onWait={setWaitlist ? toggleWait : undefined}
              waitError={waitError}
            />
          </>
        )}
      </div>
      </div>

      <CheckoutBar priceCents={totals.firstPaymentCents} priceNote={barNote} total={barTotal} hint={hint} actionLabel="Review" onAction={() => setReviewOpen(true)} />

      <Dialog
        open={reviewOpen}
        onOpenChange={(open) => {
          setReviewOpen(open);
          if (!open) setError(null);
        }}
        title="Review and start"
        footer={
          <button
            type="button"
            aria-disabled={busy || !acknowledged || hint !== null}
            onClick={() => {
              if (busy) return;
              if (!acknowledged) return void toast.warning("Tick the box to agree");
              void start();
            }}
            className={buttonVariants({ variant: "primary", className: cn("w-full sm:w-auto", (busy || !acknowledged) && "opacity-45 saturate-50", !acknowledged && "cursor-not-allowed") })}
          >
            {busy && <MorphingSquare size={14} className="mr-2 shrink-0" />}
            {busy ? "Starting…" : isParent ? "Start plan" : isFamily ? "Start group plan" : "Start plan"}
          </button>
        }
      >
        <dl className="space-y-2 text-small">
          <Row label="Plan">
            {planName} · {totals.payments === 1 ? "no commitment" : `${totals.payments} payments`}
          </Row>
          {isParent ? (
            <Row label="Paying for">
              {memberRows.filter((r) => r.trim()).length} {memberRows.filter((r) => r.trim()).length === 1 ? "child" : "children"}
              {includeSelf ? " and you" : ""}
            </Row>
          ) : (
            isFamily && (
              <Row label="People">
                {totals.people} (you and {totals.people - 1} more)
              </Row>
            )
          )}
          {isParent
            ? holders.map((h) => {
                const t = timeOf(h.key);
                return (
                  <Row key={h.key} label={h.key === "self" ? "Your weekly time" : `${h.label}'s weekly time`}>
                    {t ? `${DAY_NAMES[t.dayOfWeek]}s, ${formatTimeRange(t.startTime, CLASS_MINUTES)}` : "Not picked"}
                  </Row>
                );
              })
            : timeLine && <Row label={isFamily ? "Your weekly time" : "Weekly time"}>{timeLine}</Row>}
          <Row label={isFamily ? "Each person, every 28 days" : "Every 28 days"}><RollingNumber text={usd(totals.perPaymentCents)} /></Row>
          {!isFamily && termDiscount > 0 && (
            <Row label="Your discount">
              {termDiscount}% off <span className="text-slate-500 line-through">{usd(totals.listPerPaymentCents)}</span>
            </Row>
          )}
          <Row label="Classes">
            {totals.classesPerPayment} every 28 days{totals.payments > 1 ? `, ${classesTotal} in all` : ""}
          </Row>
          <div className="flex items-center justify-between border-t border-ink/10 pt-2 text-body font-semibold text-slate-50">
            <span>{isFamily ? `First payment, all ${totals.people}` : "Due now"}</span>
            <RollingNumber text={usd(totals.firstPaymentCents)} />
          </div>
          {totals.payments > 1 && (
            <Row label={isFamily ? "Whole plan, everyone" : "Whole plan"}><RollingNumber text={usd(totals.allPeopleTermCents)} /></Row>
          )}
        </dl>

        <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-50/20 bg-neu-base shadow-pressed-low p-3.5 text-small text-slate-300">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-ink/10 bg-slate-950 accent-slate-50"
          />
          <span>
            I have read and agree to the{" "}
            <a href="/terms#payment-plans" target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-50 underline underline-offset-2">
              Terms and Conditions
            </a>
            {isFamily && (
              <>
                , including the{" "}
                <a href={isParent ? "/terms#parent-mode" : "/terms#family-plans"} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-50 underline underline-offset-2">
                  {isParent ? "parent mode rules" : "group plan rules"}
                </a>
              </>
            )}
            .
          </span>
        </label>
        {error && (
          <p role="alert" className="mt-3 text-small text-red-400">
            {error}
          </p>
        )}
      </Dialog>
    </div>
  );
}

/** "Have a scholarship code?" under the 6 Month card: claims it right here, and the shown price follows. */
function ScholarshipClaim({
  onClaim,
  onClaimed,
}: {
  onClaim: (code: string) => Promise<{ ok: true; percent: number } | { ok: false; error: string }>;
  onClaimed: (percent: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const digits = raw.replace(/\D/g, "").slice(0, 16);

  async function claim(e: React.FormEvent) {
    e.preventDefault();
    if (digits.length !== 16) return setError("Enter all 16 digits.");
    setBusy(true);
    setError(null);
    const result = await onClaim(digits).catch(() => ({ ok: false as const, error: "Something went wrong. Please try again." }));
    setBusy(false);
    if (!result.ok) return setError(result.error);
    toast.success("Scholarship claimed", { description: `${result.percent}% off the 6 Month plan.` });
    onClaimed(result.percent);
  }

  if (!open) {
    return (
      <div className="mt-2 flex justify-end">
        <button type="button" onClick={() => setOpen(true)} className="tap inline-flex items-center text-small font-medium text-slate-300 underline underline-offset-4 hover:text-slate-50">
          Have a scholarship code?
        </button>
      </div>
    );
  }
  return (
    <form onSubmit={claim} className="mt-3 rounded-control bg-neu-base p-3 shadow-raised-low">
      <label htmlFor="plan-scholarship-code" className="text-small font-medium text-slate-200">
        Scholarship code <span className="font-normal text-slate-500">· 6 Month plan only</span>
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="plan-scholarship-code"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0000 0000 0000 0000"
          value={digits.replace(/(\d{4})(?=\d)/g, "$1 ")}
          onChange={(e) => setRaw(e.target.value)}
          maxLength={19}
          className={cn(field, "font-mono tracking-wider")}
        />
        <button type="submit" disabled={busy || digits.length !== 16} className={buttonVariants({ variant: "primary", className: "h-11 shrink-0" })}>
          {busy && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
          {busy ? "Checking…" : "Claim"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-small text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-right font-medium text-slate-100">{children}</dd>
    </div>
  );
}

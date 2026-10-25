"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { PaymentPlanTerm } from "@prisma/client";
import { CLASS_MINUTES, MAX_FAMILY_MEMBERS, OFFERED_PLAN_CADENCE, describePaymentPlan, type PricingConfig } from "@/lib/classCreditPricing";
import type { ReservableSlot } from "@/lib/classSchedule";
import { checkoutTotals, headcount, missingForCheckout, type Audience } from "@/lib/planCheckout";
import { DAY_NAMES, formatTimeRange } from "@/lib/weeklyTimeLabels";
import { useFamilyInvites, type FamilyInviteApi } from "@/components/billing/useFamilyInvites";
import { AccountCheckLine, type CheckState } from "@/components/billing/AccountCheckLine";
import { looksLikeEmail } from "@/lib/familyMemberCheck";
import { CheckoutBar } from "@/components/billing/CheckoutBar";
import { WeekdayTimePicker } from "@/components/billing/WeekdayTimePicker";
import { Dialog } from "@/components/ui/Dialog";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Tabs } from "@/components/ui/Tabs";
import { buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/Toaster";
import { cn } from "@/lib/utils";

function usd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const TERM_OPTIONS: { value: PaymentPlanTerm; label: string }[] = [
  { value: "MONTHLY", label: "1 Month" },
  { value: "TERM_3", label: "3 Months" },
  { value: "TERM_6", label: "6 Months" },
];

const field =
  "h-11 min-w-0 flex-1 rounded-control bg-neu-base px-4 text-body text-slate-100 shadow-pressed-low outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-ring";

export type StartPlanResult = { ok: true } | { ok: false; error: string };

export interface StartPlanInput {
  audience: Audience;
  term: PaymentPlanTerm;
  slot: ReservableSlot;
  /** Every family member's account email, in the order typed (empty for a solo plan). */
  memberEmails: string[];
  /** The first payment on screen when they pressed Start; the server refuses if the real price is different. */
  expectedFirstPaymentCents: number;
}

/**
 * Starting a plan: who it is for, how long, who is in the family, and the weekly time, in that order, with the price and the next step
 * pinned to the bottom of the screen the whole way. A plan the pricing page linked to arrives with its length and "just me" or "family"
 * already chosen, so the only thing left is the time. The server calls live in the parent (`onStart`, `loadSlots`), which keeps this
 * screen about the form and lets it be tried with made-up times.
 */
export function NewPlanForm({
  pricing,
  personalDiscountPercent = 0,
  initialTerm,
  initialAudience = "SOLO",
  loadSlots,
  onStart,
  loadWaitlist,
  setWaitlist,
  checkMember,
  inviteApi,
}: {
  pricing: PricingConfig;
  personalDiscountPercent?: number;
  initialTerm?: PaymentPlanTerm;
  initialAudience?: Audience;
  loadSlots: () => Promise<ReservableSlot[]>;
  onStart: (input: StartPlanInput) => Promise<StartPlanResult>;
  /** Times other students hold, and the ones this person is waiting for. Leave both out to hide waiting for a time. */
  loadWaitlist?: () => Promise<{ taken: ReservableSlot[]; mine: string[] }>;
  setWaitlist?: (slot: ReservableSlot, join: boolean) => Promise<{ ok: boolean; error: string | null }>;
  /** Asks the server whether an email is an account that can join. Leave out to skip the live check. */
  /** Invitations: a family member must accept before the plan can start. Leave out to skip (no gate). */
  inviteApi?: FamilyInviteApi;
  checkMember?: (email: string) => Promise<Exclude<CheckState, "checking" | "duplicate" | "failed">>;
}) {
  const cadence = OFFERED_PLAN_CADENCE;
  const [audience, setAudience] = useState<Audience>(initialAudience);
  const [term, setTerm] = useState<PaymentPlanTerm>(initialTerm ?? "TERM_6");
  const [memberRows, setMemberRows] = useState<string[]>([""]);
  const [slots, setSlots] = useState<ReservableSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [slot, setSlot] = useState<ReservableSlot | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusRow, setFocusRow] = useState<number | null>(null);
  const [wait, setWait] = useState<{ taken: ReservableSlot[]; mine: string[] }>({ taken: [], mine: [] });
  const [waitBusy, setWaitBusy] = useState<string | null>(null);
  const [waitError, setWaitError] = useState<string | null>(null);
  const rowRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadSlots()
      .then((result) => {
        if (!cancelled) setSlots(result);
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
  const invites = useFamilyInvites(inviteApi, audience === "FAMILY");
  const gated = Boolean(inviteApi);
  // Invitations survive a reload: the people already asked come back into the list.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !invites.loaded) return;
    restored.current = true;
    const emails = Object.keys(invites.status).filter((e) => invites.status[e] !== "SENDING");
    if (emails.length > 0 && memberRows.every((r) => r.trim() === "")) setMemberRows(emails);
  }, [invites.loaded, invites.status, memberRows]);
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
  const people = headcount(memberRows);
  const totals = useMemo(
    () => checkoutTotals({ cadence, term, pricing, audience, memberRows, personalDiscountPercent }),
    [cadence, term, pricing, audience, memberRows, personalDiscountPercent],
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
  // In the order the page asks: the people, their yes, then the time.
  const missing = missingForCheckout({ audience, memberRows, slotChosen: slot !== null });
  const hint = (missing !== "Pick a weekly time" ? missing : null) ?? accountHint ?? missing;
  const planName = describePaymentPlan(cadence, term).replace(/, .*/, "");
  const classesTotal = totals.classesPerPayment * totals.payments;
  const timeLine = slot ? `${DAY_NAMES[slot.dayOfWeek]}s, ${formatTimeRange(slot.startTime, CLASS_MINUTES)}` : null;

  const barNote = isFamily ? "first payment" : totals.payments === 1 ? "for 28 days" : "every 28 days";
  // The whole plan, so a 3 or 6 month plan shows what it adds up to before anyone starts.
  const barTotal = totals.payments > 1 ? `Whole plan: ${usd(totals.allPeopleTermCents)} over ${totals.payments} payments (${totals.payments * 28} days)` : null;

  async function start() {
    if (!slot || hint !== null) return;
    setBusy(true);
    setError(null);
    const result = await onStart({ audience, term, slot, memberEmails: isFamily ? memberRows.map((r) => r.trim()).filter(Boolean) : [], expectedFirstPaymentCents: totals.firstPaymentCents }).catch(
      (): StartPlanResult => ({ ok: false, error: "Something went wrong. Please try again." }),
    );
    setBusy(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <div className="space-y-6">
      <div className="lg:flex lg:justify-center">
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
      </div>

      <div className="space-y-6">
      <div className="space-y-6">
      <div>
        <p className="mb-2 text-small font-medium text-slate-400">Plan length</p>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {TERM_OPTIONS.map((option) => {
            const active = term === option.value;
            const t = checkoutTotals({ cadence, term: option.value, pricing, audience, memberRows, personalDiscountPercent });
            const off = Math.round((1 - t.perPaymentCents / checkoutTotals({ cadence, term: "MONTHLY", pricing, audience, memberRows, personalDiscountPercent }).perPaymentCents) * 100);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setTerm(option.value)}
                aria-pressed={active}
                className={`tap rounded-control bg-neu-base px-2 py-3 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active ? "shadow-pressed-low" : "shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                }`}
              >
                <span className={`block text-small font-semibold ${active ? "text-signal-fg" : "text-slate-100"}`}>{option.label}</span>
                <span className="mt-0.5 block text-body font-semibold tabular-nums text-slate-50">{usd(t.perPaymentCents)}</span>
                <span className="block text-small text-slate-500">{off > 0 ? `every 28 days, −${off}%` : "every 28 days"}</span>
              </button>
            );
          })}
        </div>
      </div>

      {isFamily && (
        <section aria-label="People on this plan" className="rounded-xl bg-neu-base p-4 shadow-raised-low">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-small font-semibold text-slate-50">Who is in the family?</p>
            <p className="text-small tabular-nums text-slate-300" aria-live="polite">
              <NumberTicker value={people.people} /> of {MAX_FAMILY_MEMBERS} people
            </p>
          </div>
          <ul className="mt-3 space-y-2">
            <li className="flex h-11 items-center justify-between rounded-control bg-neu-lift px-4 text-small text-slate-300 shadow-pressed-low">
              <span className="font-medium text-slate-100">You</span>
              <span>pays for everyone</span>
            </li>
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
                  placeholder="Their account email"
                  aria-label={`Family member ${i + 1} email`}
                  className={field}
                />
                {memberRows.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remove family member ${i + 1}`}
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
                <AccountCheckLine state={stateFor(i)} />
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
            Add another person
          </button>
          {toInvite.length > 0 && (
            <button type="button" onClick={() => void invites.send(toInvite)} className={buttonVariants({ variant: "primary", size: "sm", className: "ml-2 mt-3" })}>
              {toInvite.length === 1 ? "Send invitation" : `Send ${toInvite.length} invitations`}
            </button>
          )}
          {invites.error && (
            <p role="alert" className="mt-2 text-small text-red-400">
              {invites.error}
            </p>
          )}
          {people.atMax && <p className="mt-2 text-small text-slate-500">That is the most one family plan holds ({MAX_FAMILY_MEMBERS} people).</p>}
        </section>
      )}

      </div>

      <div>
        <p className="mb-2 text-small font-medium text-slate-400">{isFamily ? "Your weekly time (only you)" : "Your weekly time"}</p>
        {slotsLoading ? (
          <div className="flex items-center justify-center rounded-lg bg-neu-base py-6 shadow-raised-low">
            <MorphingSquare size={16} />
          </div>
        ) : slots.length === 0 && wait.taken.length === 0 ? (
          <p className="rounded-lg bg-neu-base px-3.5 py-3 text-small text-slate-500 shadow-raised-low">No open weekly times right now.</p>
        ) : (
          <>
            <WeekdayTimePicker
              slots={slots}
              selected={slot}
              onSelect={setSlot}
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
            {busy ? "Starting…" : isFamily ? "Start family plan" : "Start plan"}
          </button>
        }
      >
        <dl className="space-y-2 text-small">
          <Row label="Plan">
            {planName} · {totals.payments === 1 ? "no commitment" : `${totals.payments} payments`}
          </Row>
          {isFamily && (
            <Row label="People">
              {totals.people} (you and {totals.people - 1} more)
            </Row>
          )}
          {timeLine && <Row label={isFamily ? "Your weekly time" : "Weekly time"}>{timeLine}</Row>}
          <Row label={isFamily ? "Each person, every 28 days" : "Every 28 days"}>{usd(totals.perPaymentCents)}</Row>
          {!isFamily && personalDiscountPercent > 0 && (
            <Row label="Your discount">
              {personalDiscountPercent}% off <span className="text-slate-500 line-through">{usd(totals.listPerPaymentCents)}</span>
            </Row>
          )}
          <Row label="Classes">
            {totals.classesPerPayment} every 28 days{totals.payments > 1 ? `, ${classesTotal} in all` : ""}
          </Row>
          <div className="flex items-center justify-between border-t border-ink/10 pt-2 text-body font-semibold text-slate-50">
            <span>{isFamily ? `First payment, all ${totals.people}` : "Due now"}</span>
            <span className="tabular-nums">{usd(totals.firstPaymentCents)}</span>
          </div>
          {totals.payments > 1 && (
            <Row label={isFamily ? "Whole plan, everyone" : "Whole plan"}>{usd(totals.allPeopleTermCents)}</Row>
          )}
        </dl>

        <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl border border-[rgb(var(--c-s-50)/0.2)] bg-[rgb(var(--c-s-50)/0.05)] p-3.5 text-small text-slate-300">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-ink/10 bg-slate-950 accent-[rgb(var(--c-s-50))]"
          />
          <span>
            I have read and agree to the{" "}
            <a href="/terms#payment-plans" target="_blank" rel="noopener noreferrer" className="font-semibold text-[rgb(var(--c-s-50))] underline underline-offset-2">
              Terms and Conditions
            </a>
            {isFamily && (
              <>
                , including the{" "}
                <a href="/terms#family-plans" target="_blank" rel="noopener noreferrer" className="font-semibold text-[rgb(var(--c-s-50))] underline underline-offset-2">
                  family plan rules
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-right font-medium text-slate-100">{children}</dd>
    </div>
  );
}

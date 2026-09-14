"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ZellePaymentStatus } from "@prisma/client";
import {
  MIN_CURRICULUM_FAMILY_BUNDLE_RECIPIENTS,
  MAX_CURRICULUM_FAMILY_BUNDLE_RECIPIENTS,
  CURRICULUM_FAMILY_BUNDLE_DISCOUNT_RATE,
  calculateCurriculumFamilyBundleTotal,
} from "@/lib/curriculum";
import { ZelleUnlockGate } from "@/components/billing/ZelleUnlockGate";
import { CheckIcon, SpinnerIcon, XIcon } from "@/components/ui/icons";
import { MorphingSquare } from "@/components/ui/morphing-square";
import type { FamilyBundleRecipientCheck } from "@/lib/payments";
import {
  checkCurriculumBundleRecipientsAction,
  createCurriculumFamilyBundlePaymentAction,
  submitCurriculumFamilyBundlePaymentAction,
} from "./actions";

interface PendingPayment {
  id: string;
  status: ZellePaymentStatus;
  rejectionReason: string | null;
  amountCents: number;
}

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RowStatus =
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "duplicate" }
  | { kind: "checking" }
  | { kind: "found"; name: string | null }
  | { kind: "not-found" };

/**
 * Same shape as FamilyBundleFlow.tsx (billing/lessons), for curriculum
 * access instead of class credits: no cadence/term to pick here, curriculum
 * is one flat one-time price, so this is just the recipient list, the
 * pricing summary, and the payment gate. Same verified-existing-account
 * requirement and the same reasoning for it (a flat discount off a list of
 * unverified emails would be an easy way to buy at 20% off with
 * fabricated-looking addresses), see FamilyBundleFlow's own comment.
 */
export function CurriculumFamilyBundleFlow({ zelleHandle }: { zelleHandle: string }) {
  const [emails, setEmails] = useState<string[]>(["", ""]);
  const [results, setResults] = useState<Record<string, FamilyBundleRecipientCheck>>({});
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  const [acknowledged, setAcknowledged] = useState(false);
  const [payment, setPayment] = useState<PendingPayment | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const normalized = emails.map((e) => e.trim().toLowerCase());

  function rowStatus(index: number): RowStatus {
    const email = normalized[index];
    if (!email) return { kind: "empty" };
    if (!EMAIL_RE.test(email)) return { kind: "invalid" };
    if (normalized.filter((e) => e === email).length > 1 && normalized.slice(0, index).includes(email)) {
      return { kind: "duplicate" };
    }
    const result = results[email];
    if (!result) return { kind: "checking" };
    return result.found ? { kind: "found", name: result.name } : { kind: "not-found" };
  }

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const candidates = Array.from(new Set(normalized.filter((e) => e && EMAIL_RE.test(e))));
    const unchecked = candidates.filter((e) => !(e in results));
    if (unchecked.length === 0) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setChecking(true);
      setCheckError(null);
      checkCurriculumBundleRecipientsAction(unchecked)
        .then((response) => {
          if (!response.ok) {
            setCheckError(response.error);
            return;
          }
          setResults((prev) => {
            const next = { ...prev };
            for (const r of response.results) next[r.email] = r;
            return next;
          });
        })
        .catch(() => setCheckError("Couldn't check those accounts. Please try again."))
        .finally(() => setChecking(false));
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalized.join("|")]);

  function updateEmail(index: number, value: string) {
    setEmails((prev) => prev.map((e, i) => (i === index ? value : e)));
    setSubmitError(null);
  }

  function addRecipient() {
    setEmails((prev) => (prev.length >= MAX_CURRICULUM_FAMILY_BUNDLE_RECIPIENTS ? prev : [...prev, ""]));
  }

  function removeRecipient(index: number) {
    setEmails((prev) => (prev.length <= MIN_CURRICULUM_FAMILY_BUNDLE_RECIPIENTS ? prev : prev.filter((_, i) => i !== index)));
  }

  const filledCount = normalized.filter(Boolean).length;
  const total = calculateCurriculumFamilyBundleTotal(filledCount || MIN_CURRICULUM_FAMILY_BUNDLE_RECIPIENTS);

  const allRowsVerified =
    emails.length >= MIN_CURRICULUM_FAMILY_BUNDLE_RECIPIENTS && emails.every((_, i) => rowStatus(i).kind === "found");
  const canSubmit = allRowsVerified && acknowledged && !checking && !loading;

  async function handleContinue() {
    setLoading(true);
    setSubmitError(null);
    const result = await createCurriculumFamilyBundlePaymentAction(emails);
    setLoading(false);
    if (!result.ok || !result.id || !result.status || result.amountCents === null) {
      setSubmitError(result.error ?? "Something went wrong creating this payment. Please try again.");
      return;
    }
    setPayment({ id: result.id, status: result.status as ZellePaymentStatus, rejectionReason: null, amountCents: result.amountCents });
  }

  if (payment) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setPayment(null)}
          className="mb-4 text-xs text-slate-500 transition hover:text-slate-300"
        >
          ← Change bundle
        </button>
        <div className="mb-4 rounded-xl border border-ink/10 p-4">
          <p className="text-sm text-slate-100">Curriculum access for {emails.length} accounts</p>
          <p className="mt-1 text-xs text-emerald-400">
            {CURRICULUM_FAMILY_BUNDLE_DISCOUNT_RATE * 100}% family bundle discount applied
          </p>
        </div>
        <ZelleUnlockGate
          status={payment.status}
          rejectionReason={payment.rejectionReason}
          scaleCode="Curriculum"
          scaleTitle={`Full curriculum × ${emails.length} accounts`}
          eyebrowLabel="Family Bundle"
          amountCents={payment.amountCents}
          zelleHandle={zelleHandle}
          onSubmitPayment={submitCurriculumFamilyBundlePaymentAction.bind(null, payment.id)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-slate-400">
            Recipient accounts ({emails.length}/{MAX_CURRICULUM_FAMILY_BUNDLE_RECIPIENTS})
          </p>
          <span className="text-xs text-slate-500">Each needs its own Bass Note Piano account already</span>
        </div>

        <div className="space-y-2.5">
          {emails.map((email, index) => {
            const status = rowStatus(index);
            return (
              <div key={index} className="flex items-center gap-2.5">
                <div className="relative flex-1">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => updateEmail(index, e.target.value)}
                    placeholder={`Recipient ${index + 1} email`}
                    className="w-full rounded-lg border border-ink/10 bg-slate-950/40 px-3.5 py-2.5 pr-9 text-base text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-[rgb(var(--c-s-50)/0.5)]"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                    {status.kind === "checking" && <SpinnerIcon className="text-slate-500" />}
                    {status.kind === "found" && <CheckIcon className="text-emerald-400" />}
                    {status.kind === "not-found" && <XIcon className="text-red-400" />}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeRecipient(index)}
                  disabled={emails.length <= MIN_CURRICULUM_FAMILY_BUNDLE_RECIPIENTS}
                  aria-label={`Remove recipient ${index + 1}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ink/10 text-slate-400 transition hover:border-red-400/30 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-ink/10 disabled:hover:text-slate-400"
                >
                  <XIcon size={13} />
                </button>
              </div>
            );
          })}
        </div>

        {emails.map((_, index) => {
          const status = rowStatus(index);
          if (status.kind === "invalid") {
            return (
              <p key={`err-${index}`} className="mt-1.5 text-xs text-red-400">
                Recipient {index + 1}: enter a valid email address.
              </p>
            );
          }
          if (status.kind === "duplicate") {
            return (
              <p key={`err-${index}`} className="mt-1.5 text-xs text-red-400">
                Recipient {index + 1}: already entered above. Each recipient needs a different account.
              </p>
            );
          }
          if (status.kind === "not-found") {
            const registerHref = `/register?email=${encodeURIComponent(normalized[index])}&callbackUrl=${encodeURIComponent("/billing/curriculum/family")}`;
            return (
              <p key={`err-${index}`} className="mt-1.5 text-xs text-red-400">
                Recipient {index + 1}: no account yet at that email.{" "}
                <Link href={registerHref} target="_blank" className="underline hover:opacity-70">
                  Create their account
                </Link>{" "}
                first, then come back here to add them.
              </p>
            );
          }
          if (status.kind === "found") {
            return (
              <p key={`err-${index}`} className="mt-1.5 text-xs text-emerald-400">
                Recipient {index + 1}: verified{status.name ? ` (${status.name})` : ""}.
              </p>
            );
          }
          return null;
        })}

        {checkError && <p className="mt-2 text-xs text-red-400">{checkError}</p>}

        <button
          type="button"
          onClick={addRecipient}
          disabled={emails.length >= MAX_CURRICULUM_FAMILY_BUNDLE_RECIPIENTS}
          className="mt-3 text-xs font-medium text-[rgb(var(--c-s-50))] transition hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-40"
        >
          + Add another recipient
        </button>
      </div>

      <div className="rounded-xl border border-ink/10 p-4 sm:p-5">
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>
            {formatUsd(total.perRecipientCents)} × {emails.length} accounts
          </span>
          <span>{formatUsd(total.combinedBeforeFamilyDiscountCents)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-sm text-emerald-400">
          <span>Family bundle discount ({CURRICULUM_FAMILY_BUNDLE_DISCOUNT_RATE * 100}%)</span>
          <span>−{formatUsd(total.familyDiscountCents)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-ink/10 pt-2 text-base font-semibold text-slate-50">
          <span>Total</span>
          <span>{formatUsd(total.totalCents)}</span>
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-[rgb(var(--c-s-50)/0.2)] bg-[rgb(var(--c-s-50)/0.05)] p-3.5 text-xs text-slate-300">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-ink/10 bg-slate-950 accent-[rgb(var(--c-s-50))]"
        />
        <span>
          I understand curriculum access goes directly to the accounts listed above, not to my own (unless I&apos;m one of
          them), and that the purchase is <span className="font-medium text-[rgb(var(--c-s-50))]">non-refundable</span>. Full{" "}
          <Link href="/terms" target="_blank" className="text-[rgb(var(--c-s-50))] underline hover:opacity-70">
            terms &amp; refund policy
          </Link>
          .
        </span>
      </label>

      {submitError && <p className="text-sm text-red-400">{submitError}</p>}

      <button
        type="button"
        onClick={handleContinue}
        disabled={!canSubmit}
        className="cta-sheen cta-fill flex w-full items-center justify-center rounded-xl py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading && <MorphingSquare size={14} className="mr-2 shrink-0" />}
        {loading ? "Loading…" : `Continue to payment · ${formatUsd(total.totalCents)}`}
      </button>
      {!allRowsVerified && (
        <p className="text-center text-xs text-slate-500">
          Every recipient needs a verified Bass Note Piano account before you can continue.
        </p>
      )}
    </div>
  );
}

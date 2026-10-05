"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SuccessGlowPulse } from "@/components/ui/SuccessGlowPulse";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { Tabs } from "@/components/ui/Tabs";
import { QRCodeSVG } from "qrcode.react";

export interface ZellePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** e.g. "Scale 3", or "Pro" for the lifetime purchase */
  scaleCode: string;
  /** e.g. "Bati — Major, Minor & Lydian", or "the full curriculum" for the lifetime purchase */
  scaleTitle: string;
  /** Header eyebrow suffix, e.g. "Session Unlock" or "Lifetime Unlock" */
  eyebrowLabel: string;
  amountCents: number;
  /** Platform's Zelle-registered email or phone handle. */
  zelleHandle: string;
  onSubmit: (payload: {
    senderName: string;
    note?: string;
    method: "ZELLE" | "VENMO";
  }) => Promise<void>;
}

type Step = "instructions" | "confirming" | "pending";

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const panelVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", bounce: 0, duration: 0.32 },
  },
  exit: {
    opacity: 0,
    y: 16,
    scale: 0.97,
    transition: { duration: 0.15, ease: "easeIn" },
  },
};

const stepVariants = {
  enter: { opacity: 0, x: 16 },
  center: { opacity: 1, x: 0, transition: { type: "spring", bounce: 0, duration: 0.36 } },
  exit: { opacity: 0, x: -16, transition: { duration: 0.15 } },
};

// Venmo usernames are letters, digits, dashes and underscores. Anything else
// in the env var would break the link, so Venmo is simply hidden.
const VENMO_HANDLE = (process.env.NEXT_PUBLIC_VENMO_HANDLE ?? "BassNotePiano").replace(/^@/, "").trim();
const VENMO_OK = /^[A-Za-z0-9_-]{2,40}$/.test(VENMO_HANDLE);

/** Pre-filled Venmo links. The app link opens Venmo on a phone, the web link is what the QR code carries. */
function venmoLinks(amountCents: number, note: string) {
  const query = `txn=pay&amount=${(amountCents / 100).toFixed(2)}&note=${encodeURIComponent(note)}&audience=private`;
  return {
    app: `venmo://paycharge?recipients=${VENMO_HANDLE}&${query}`,
    web: `https://venmo.com/${VENMO_HANDLE}?${query}`,
  };
}

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function ZellePaymentModal({
  isOpen,
  onClose,
  scaleCode,
  scaleTitle,
  eyebrowLabel,
  amountCents,
  zelleHandle,
  onSubmit,
}: ZellePaymentModalProps) {
  const [step, setStep] = useState<Step>("instructions");
  const [senderName, setSenderName] = useState("");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [method, setMethod] = useState<"ZELLE" | "VENMO">("ZELLE");
  const venmo = venmoLinks(amountCents, `${scaleCode}: ${scaleTitle} (Bass Note Piano)`);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep("instructions");
    setMethod("ZELLE");
    setSenderName("");
    setNote("");
    setError(null);
  }

  function handleClose() {
    if (submitting) return;
    onClose();
    // Delay so the exit animation isn't interrupted by state changing mid-flight.
    window.setTimeout(reset, 200);
  }

  async function handleCopyHandle() {
    await navigator.clipboard.writeText(method === "VENMO" ? `@${VENMO_HANDLE}` : zelleHandle);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function handleSubmit() {
    if (!senderName.trim()) {
      setError("Enter the name the transfer was sent under.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({ senderName: senderName.trim(), note: note.trim() || undefined, method });
      setStep("pending");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong submitting your confirmation.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial="hidden"
          animate="visible"
          exit="hidden"
        >
          <motion.div
            variants={backdropVariants}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-scrim/60"
            onClick={handleClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="zelle-modal-title"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="glass-surface-modal relative w-full max-w-md overflow-hidden"
          >
            {step === "pending" && <SuccessGlowPulse />}
            <div className="h-1 w-full bg-gradient-to-r from-[rgb(var(--c-s-300)/0.4)] via-[rgb(var(--c-s-50))] to-[rgb(var(--c-s-300)/0.4)]" />

            <div className="px-6 pb-6 pt-5">
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">
                    {scaleCode} · {eyebrowLabel}
                  </p>
                  <h2 id="zelle-modal-title" className="mt-1 text-body text-slate-50 font-semibold">
                    {scaleTitle}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={submitting}
                  aria-label="Close"
                  className="rounded-full p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100 disabled:opacity-40"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <AnimatePresence mode="wait">
                {step === "instructions" && (
                  <motion.div key="instructions" variants={stepVariants} initial="enter" animate="center" exit="exit">
                    {VENMO_OK && (
                      <Tabs<"ZELLE" | "VENMO">
                        label="Payment method"
                        value={method}
                        onChange={setMethod}
                        items={[
                          { id: "ZELLE", label: "Zelle" },
                          { id: "VENMO", label: "Venmo" },
                        ]}
                        className="mb-4"
                      />
                    )}
                    <p className="text-small text-slate-400">
                      Send <span className="font-semibold text-[rgb(var(--c-s-50))]">{formatUsd(amountCents)}</span> via{" "}
                      {method === "VENMO" ? "Venmo" : "Zelle"} for {scaleTitle}, then confirm below.
                    </p>

                    {method === "VENMO" && (
                      <>
                        <a
                          href={venmo.app}
                          className="cta-sheen cta-fill mt-4 flex w-full items-center justify-center rounded-xl py-2.5 text-small font-semibold md:hidden"
                        >
                          Open Venmo
                        </a>
                        <div className="mt-4 hidden flex-col items-center gap-2 md:flex">
                          <div className="rounded-xl bg-white p-3">
                            <QRCodeSVG value={venmo.web} size={148} />
                          </div>
                          <p className="text-small text-slate-500">Scan with your phone camera</p>
                        </div>
                      </>
                    )}

                    <div className="mt-4 flex items-center justify-between gap-3 rounded-xl px-4 py-3 bg-neu-base shadow-raised-low">
                      <div className="min-w-0">
                        <p className="text-small uppercase tracking-wide text-slate-500">{method === "VENMO" ? "Venmo" : "Zelle handle"}</p>
                        <p className="truncate font-mono text-small text-slate-100">{method === "VENMO" ? `@${VENMO_HANDLE}` : zelleHandle}</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyHandle}
                        className="tap shrink-0 rounded-lg border border-[rgb(var(--c-s-50)/0.3)] px-3 py-1.5 text-small font-medium text-[rgb(var(--c-s-50))] transition hover:bg-[rgb(var(--c-s-50)/0.1)]"
                      >
                        {copied ? "Copied" : "Copy"}
                      </button>
                    </div>

                    <ol className="mt-5 space-y-2.5 text-small text-slate-300">
                      <li className="flex gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--c-s-50)/0.15)] text-small font-semibold text-[rgb(var(--c-s-50))]">1</span>
                        {method === "VENMO"
                          ? `Send ${formatUsd(amountCents)} on Venmo, set to Private.`
                          : `Open your bank's Zelle transfer and send ${formatUsd(amountCents)} to the handle above.`}
                      </li>
                      <li className="flex gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--c-s-50)/0.15)] text-small font-semibold text-[rgb(var(--c-s-50))]">2</span>
                        Tell us you sent it, access unlocks once we verify the transfer.
                      </li>
                    </ol>

                    <button
                      type="button"
                      onClick={() => setStep("confirming")}
                      className="cta-sheen cta-fill mt-6 w-full rounded-xl py-2.5 text-small font-semibold"
                    >
                      I&apos;ve sent the payment
                    </button>
                  </motion.div>
                )}

                {step === "confirming" && (
                  <motion.div key="confirming" variants={stepVariants} initial="enter" animate="center" exit="exit">
                    <div className="space-y-3.5">
                      <div>
                        <label className="mb-1 block text-small font-medium text-slate-400">{method === "VENMO" ? "Name on the Venmo account" : "Name on the Zelle transfer"}</label>
                        <input
                          autoFocus
                          value={senderName}
                          onChange={(e) => setSenderName(e.target.value)}
                          placeholder="Jordan Alemu"
                          className="w-full glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.6)]"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-small font-medium text-slate-400">Note (optional)</label>
                        <textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          rows={2}
                          placeholder="Anything that helps us match the transfer"
                          className="w-full resize-none glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.6)]"
                        />
                      </div>

                      {error && <p className="text-small text-red-400">{error}</p>}

                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setStep("instructions")}
                          disabled={submitting}
                          className="flex-1 rounded-xl py-2.5 text-small font-medium text-slate-300 transition disabled:opacity-40 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          onClick={handleSubmit}
                          disabled={submitting}
                          className="cta-sheen cta-fill flex flex-1 items-center justify-center rounded-xl py-2.5 text-small font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {submitting && <MorphingSquare size={14} className="mr-1.5 shrink-0" />}
                          {submitting ? "Submitting…" : "Submit for review"}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {step === "pending" && (
                  <motion.div key="pending" variants={stepVariants} initial="enter" animate="center" exit="exit" className="py-2 text-center">
                    <motion.div
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", bounce: 0.35, duration: 0.5, delay: 0.05 }}
                      className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[rgb(var(--c-s-50)/0.1)]"
                    >
                      <motion.svg
                        width="26"
                        height="26"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="text-[rgb(var(--c-s-50))]"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                      >
                        <path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="12" cy="12" r="9" />
                      </motion.svg>
                    </motion.div>
                    <h3 className="text-body text-slate-50">Confirmation received</h3>
                    <p className="mx-auto mt-1.5 max-w-xs text-small text-slate-400">
                      We&apos;re verifying your transfer.
                    </p>
                    <button
                      type="button"
                      onClick={handleClose}
                      className="mt-6 w-full rounded-xl py-2.5 text-small font-medium text-slate-300 transition bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                    >
                      Done
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

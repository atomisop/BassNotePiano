"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { SuccessGlowPulse } from "@/components/ui/SuccessGlowPulse";
import { AnimatedCheck } from "@/components/ui/AnimatedCheck";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { Tabs } from "@/components/ui/Tabs";
import { QRCodeSVG } from "qrcode.react";
import { FADE, SPRING } from "@/lib/motionTokens";
import { paymentReferenceCode } from "@/lib/paymentReference";
import { normalizePhone, PHONE_HELP } from "@/lib/phone";
import { checkPaymentPhoneAction, getPaymentPhoneStateAction, savePaymentPhoneAction } from "@/app/(dashboard)/billing/payment-phone-actions";
import type { PaymentPhoneCheck } from "@/lib/paymentPhone";
import { buttonVariants } from "@/components/ui/button";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { toast } from "@/components/ui/Toaster";

export interface ZellePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** e.g. "Scale 3", or "Pro" for the lifetime purchase */
  scaleCode: string;
  /** e.g. "Bati, Major, Minor & Lydian", or "the full curriculum" for the lifetime purchase */
  scaleTitle: string;
  /** Header eyebrow suffix, e.g. "Session Unlock" or "Lifetime Unlock" */
  eyebrowLabel: string;
  amountCents: number;
  /** Platform's Zelle-registered email or phone handle. */
  zelleHandle: string;
  /** The payment this sheet pays for. Its short code goes in the transfer note so the bank email finds the right payment even when someone else sends the money. */
  paymentId?: string;
  /** Polled while the sheet is open: resolves to the payment's status, so it can notice the bank email clearing it. */
  checkStatus?: () => Promise<string | null>;
  onVerified?: () => void;
  /** Optional: reads a screenshot of the bank's confirmation and says whether amount, code and date agree. Never approves anything. */
  onPrecheck?: (base64: string, mimeType: string) => Promise<{ ok: true; matches: boolean; summary: string } | { ok: false; error: string }>;
  onSubmit: (payload: {
    senderName: string;
    note?: string;
    method: "ZELLE" | "VENMO";
  }) => Promise<void>;
}

// "loading" and "phone" come first: the sheet asks which phone the person pays from before it shows the code.
type Step = "loading" | "phone" | "instructions" | "confirming" | "pending" | "verified";

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
    transition: SPRING.snappy,
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
  center: { opacity: 1, x: 0, transition: SPRING.smooth },
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
  paymentId,
  checkStatus,
  onVerified,
  onPrecheck,
  onSubmit,
}: ZellePaymentModalProps) {
  const [step, setStep] = useState<Step>(paymentId ? "loading" : "instructions");
  const [phoneInput, setPhoneInput] = useState("");
  // The account has no number yet: typed twice, like a password, and saved to the account as well.
  const [phoneConfirm, setPhoneConfirm] = useState("");
  const [accountLast4, setAccountLast4] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneSaving, setPhoneSaving] = useState(false);
  // What the server says about the typed number: is it real, and is it the one on the account (or free to add).
  const [phoneCheck, setPhoneCheck] = useState<PaymentPhoneCheck | "checking" | null>(null);
  const hasAccountPhone = accountLast4 !== null;
  const typedDigits = phoneInput.replace(/\D/g, "").length;
  const confirmDigits = phoneConfirm.replace(/\D/g, "").length;
  const phoneNormalized = normalizePhone(phoneInput);
  const confirmMatches = hasAccountPhone || (Boolean(phoneNormalized) && phoneNormalized === normalizePhone(phoneConfirm));
  // The green check: the number is real and is the account's own (or new and not anyone else's, typed twice).
  const phoneOk = confirmMatches && phoneCheck !== null && phoneCheck !== "checking" && (phoneCheck.status === "match" || phoneCheck.status === "free");
  const [senderName, setSenderName] = useState("");
  const [note, setNote] = useState("");
  const [precheck, setPrecheck] = useState<{ state: "reading" } | { state: "done"; matches: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [method, setMethod] = useState<"ZELLE" | "VENMO">("ZELLE");
  const reference = paymentId ? paymentReferenceCode(paymentId) : null;
  const venmo = venmoLinks(amountCents, `${scaleCode}: ${scaleTitle} (Bass Note Piano)${reference ? ` ${reference}` : ""}`);
  const [copiedWhat, setCopiedWhat] = useState<"amount" | "code" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Portaled to the page itself: inside a page with a transform, `fixed` is measured against that box and the sheet lands off screen.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Ask the server as the number is typed, so the check reflects the real comparison with the account.
  useEffect(() => {
    if (step !== "phone") return;
    if (typedDigits < 10) {
      setPhoneCheck(null);
      return;
    }
    let live = true;
    setPhoneCheck("checking");
    const timer = window.setTimeout(() => {
      checkPaymentPhoneAction(phoneInput)
        .then((result) => live && setPhoneCheck(result))
        .catch(() => live && setPhoneCheck({ status: "invalid", error: "We couldn't check that just now. Try again." }));
    }, 350);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [step, phoneInput, typedDigits]);

  // Before showing the code, find out whether to ask for the phone number (owner setting) and whether this payment
  // already has one.
  useEffect(() => {
    if (!isOpen || step !== "loading" || !paymentId) return;
    let live = true;
    getPaymentPhoneStateAction(paymentId)
      .then((state) => {
        if (!live) return;
        if (!state || !state.ask || state.paymentPhone) return setStep("instructions");
        setAccountLast4(state.hasAccountPhone ? state.accountPhoneLast4 : null);
        setStep("phone");
      })
      .catch(() => live && setStep("instructions"));
    return () => {
      live = false;
    };
  }, [isOpen, step, paymentId]);

  async function handlePhoneContinue() {
    if (!paymentId) return setStep("instructions");
    if (!phoneOk) return;
    setPhoneError(null);
    setPhoneSaving(true);
    const result = await savePaymentPhoneAction(paymentId, phoneInput).catch(() => null);
    setPhoneSaving(false);
    if (!result || !result.ok) {
      setPhoneError(result?.error ?? "Something went wrong. Please try again.");
      return;
    }
    setStep("instructions");
  }

  const checkMessage =
    phoneCheck && phoneCheck !== "checking"
      ? phoneCheck.status === "invalid"
        ? phoneCheck.error
        : phoneCheck.status === "mismatch"
          ? "That isn't the phone number on your account. Type the number saved on your account, or change it in Settings, then Account."
          : phoneCheck.status === "taken"
            ? "That number is already on another account. If it is yours, message us and we will sort it out."
            : null
      : null;

  // The manual "tell us" button only appears once the automatic check has had a fair chance.
  const [waitedLong, setWaitedLong] = useState(false);

  // The system watches for the payment itself: the bank or Venmo email clears it with no tap from the student.
  useEffect(() => {
    if (!isOpen || (step !== "instructions" && step !== "confirming")) return;
    const longTimer = window.setTimeout(() => setWaitedLong(true), 90_000);
    const poll = window.setInterval(async () => {
      if (!checkStatus || document.visibilityState !== "visible") return;
      const result = await checkStatus().catch(() => null);
      if (result === "VERIFIED") {
        setStep("verified");
        onVerified?.();
      }
    }, 5_000);
    return () => {
      window.clearTimeout(longTimer);
      window.clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, step]);

  function reset() {
    setWaitedLong(false);
    setStep(paymentId ? "loading" : "instructions");
    setPhoneError(null);
    setPhoneInput("");
    setPhoneConfirm("");
    setPhoneCheck(null);
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

  const dialogRef = useDialogFocus<HTMLDivElement>(isOpen, handleClose);

  async function handleCopyHandle() {
    await navigator.clipboard.writeText(method === "VENMO" ? `@${VENMO_HANDLE}` : zelleHandle);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function handleCopy(what: "amount" | "code", value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedWhat(what);
    window.setTimeout(() => setCopiedWhat(null), 1800);
  }

  /** Shrinks the screenshot in the browser (a phone screenshot is large), then asks the server to read it. */
  async function handleScreenshot(file: File | undefined) {
    if (!file || !onPrecheck) return;
    setPrecheck({ state: "reading" });
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      const result = await onPrecheck(dataUrl.split(",")[1] ?? "", "image/jpeg");
      setPrecheck(result.ok ? { state: "done", matches: result.matches, text: result.summary.replace(/^Screenshot check: /, "") } : { state: "done", matches: false, text: result.error });
    } catch {
      setPrecheck({ state: "done", matches: false, text: "Could not read that image. You can still send it for review." });
    }
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
      toast.info("Sent for review", { description: "We will check your payment and tell you here as soon as it is approved." });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong submitting your confirmation.";
      setError(message);
      toast.error("Couldn't send that", { description: message, action: { label: "Retry", onClick: () => void handleSubmit() } });
    } finally {
      setSubmitting(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="kb-fit fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4"
          initial="hidden"
          animate="visible"
          exit="hidden"
        >
          <motion.div
            variants={backdropVariants}
            transition={FADE}
            className="absolute inset-0 bg-scrim/60"
            onClick={handleClose}
          />

          <motion.div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="zelle-modal-title"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="glass-surface-modal relative !bg-neu-base max-h-[92dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-b-none pb-[env(safe-area-inset-bottom)] sm:max-h-[calc(100dvh-2rem)] sm:rounded-b-[inherit] sm:pb-0"
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
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <AnimatePresence mode="wait">
                {step === "loading" && (
                  <motion.div key="loading" variants={stepVariants} initial="enter" animate="center" exit="exit" className="flex justify-center py-10">
                    <MorphingSquare size={18} />
                  </motion.div>
                )}

                {step === "phone" && (
                  <motion.div key="phone" variants={stepVariants} initial="enter" animate="center" exit="exit">
                    <div className="space-y-3.5">
                      <div>
                        <label htmlFor="pay-phone" className="mb-1 block text-small font-medium text-slate-300">
                          {hasAccountPhone ? "Confirm your phone number" : "Phone number you will pay from"}
                        </label>
                        <div className="relative">
                          <input
                            id="pay-phone"
                            type="tel"
                            inputMode="tel"
                            autoComplete={hasAccountPhone ? "off" : "tel"}
                            autoFocus
                            value={phoneInput}
                            onChange={(e) => setPhoneInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handlePhoneContinue()}
                            placeholder="(555) 123-4567"
                            className="w-full glass-surface-subtle py-2 pl-3 pr-12 text-body text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.6)]"
                          />
                          {phoneOk && (
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                              <AnimatedCheck size={26} />
                            </span>
                          )}
                          {phoneCheck === "checking" && (
                            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2">
                              <MorphingSquare size={16} />
                            </span>
                          )}
                        </div>
                        {checkMessage ? (
                          <p role="status" className="mt-1.5 text-small text-red-400">{checkMessage}</p>
                        ) : (
                          <p className="mt-1.5 text-small text-slate-500">
                            {hasAccountPhone
                              ? `Type the phone number saved on your account (it ends in ${accountLast4}). It has to match, so nobody can pay as someone else.`
                              : `The number linked to your Zelle or Venmo account. It is saved to your account too. ${PHONE_HELP}`}
                          </p>
                        )}
                      </div>
                      {!hasAccountPhone && (
                        <div>
                          <label htmlFor="pay-phone-confirm" className="mb-1 block text-small font-medium text-slate-300">
                            Confirm phone number
                          </label>
                          <input
                            id="pay-phone-confirm"
                            type="tel"
                            inputMode="tel"
                            autoComplete="off"
                            value={phoneConfirm}
                            onChange={(e) => setPhoneConfirm(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handlePhoneContinue()}
                            placeholder="Type it again"
                            aria-invalid={confirmDigits >= 10 && !confirmMatches}
                            className="w-full glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.6)]"
                          />
                          {confirmDigits >= 10 && !confirmMatches && (
                            <p role="status" className="mt-1.5 text-small text-red-400">These don&apos;t match yet.</p>
                          )}
                        </div>
                      )}
                      {phoneError && <p role="alert" className="text-small text-red-400">{phoneError}</p>}
                      <button
                        type="button"
                        onClick={handlePhoneContinue}
                        disabled={phoneSaving || !phoneOk}
                        className={buttonVariants({ variant: "primary", className: "flex w-full" })}
                      >
                        {phoneSaving && <MorphingSquare size={14} className="mr-1.5 shrink-0" />}
                        {phoneSaving ? "Saving…" : "Continue to payment"}
                      </button>
                    </div>
                  </motion.div>
                )}

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
                    {method === "VENMO" && (
                      <>
                        <a
                          href={venmo.app}
                          className={buttonVariants({ variant: "primary", className: "mt-4 flex w-full md:hidden" })}
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
                        className={buttonVariants({ variant: "secondary", size: "sm", className: "shrink-0 text-[rgb(var(--c-s-50))]" })}
                      >
                        {copied ? "Copied" : "Copy"}
                      </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3 rounded-xl px-4 py-3 bg-neu-base shadow-raised-low">
                      <div className="min-w-0">
                        <p className="text-small uppercase tracking-wide text-slate-500">Exact amount</p>
                        <p className="truncate font-mono text-small text-slate-100">{formatUsd(amountCents)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy("amount", (amountCents / 100).toFixed(2))}
                        className={buttonVariants({ variant: "secondary", size: "sm", className: "shrink-0 text-[rgb(var(--c-s-50))]" })}
                      >
                        {copiedWhat === "amount" ? "Copied" : "Copy"}
                      </button>
                    </div>

                    {reference && method === "ZELLE" && (
                      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl px-4 py-3 bg-neu-base shadow-raised-low">
                        <div className="min-w-0">
                          <p className="text-small uppercase tracking-wide text-slate-500">Put this in the message</p>
                          <p className="truncate font-mono text-small text-slate-100">{reference}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopy("code", reference)}
                          className={buttonVariants({ variant: "secondary", size: "sm", className: "shrink-0 text-[rgb(var(--c-s-50))]" })}
                        >
                          {copiedWhat === "code" ? "Copied" : "Copy"}
                        </button>
                      </div>
                    )}

                    <ol className="mt-5 space-y-2.5 text-small text-slate-300">
                      <li className="flex gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--c-s-50)/0.15)] text-small font-semibold text-[rgb(var(--c-s-50))]">1</span>
                        {method === "VENMO"
                          ? `Send exactly ${formatUsd(amountCents)} on Venmo, set to Private. Leave the note as it is.`
                          : `Open your bank's Zelle transfer and send exactly ${formatUsd(amountCents)} to the handle above.`}
                      </li>
                      {reference && method === "ZELLE" && (
                        <li className="flex gap-2.5">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--c-s-50)/0.15)] text-small font-semibold text-[rgb(var(--c-s-50))]">2</span>
                          Type {reference} in the message box. That is how we find your payment, even if someone else sends it for you.
                        </li>
                      )}
                    </ol>
                    <p className="mt-3 text-small text-slate-500">We only accept Zelle and Venmo.</p>

                    <div className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-neu-base px-4 py-3 text-small font-medium text-slate-200 shadow-pressed-low" role="status">
                      <MorphingSquare size={13} className="shrink-0" />
                      Waiting for your payment
                    </div>
                    {waitedLong && (
                      <button
                        type="button"
                        onClick={() => setStep("confirming")}
                        className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-3 w-full" })}
                      >
                        Paid and not unlocked? Tell us
                      </button>
                    )}
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

                      {onPrecheck && (
                        <div>
                          <label className="mb-1 block text-small font-medium text-slate-400">Screenshot of your bank&apos;s confirmation (optional)</label>
                          <input type="file" accept="image/*" onChange={(e) => void handleScreenshot(e.target.files?.[0])} className="block w-full text-small text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-neu-base file:px-3 file:py-2 file:text-small file:font-medium file:text-slate-100" />
                          {precheck?.state === "reading" && <p className="mt-1.5 text-small text-slate-400">Checking your screenshot…</p>}
                          {precheck?.state === "done" && (
                            <p role="status" className={`mt-1.5 text-small ${precheck.matches ? "text-emerald-400" : "text-amber-300"}`}>
                              {precheck.matches ? "Looks right: " : "Check this: "}
                              {precheck.text}
                            </p>
                          )}
                        </div>
                      )}

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
                          className={buttonVariants({ variant: "primary", size: "sm", className: "flex flex-1" })}
                        >
                          {submitting && <MorphingSquare size={14} className="mr-1.5 shrink-0" />}
                          {submitting ? "Submitting…" : "Submit for review"}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {step === "verified" && (
                  <motion.div key="verified" variants={stepVariants} initial="enter" animate="center" exit="exit" className="py-2 text-center">
                    <motion.div
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ ...SPRING.lively, delay: 0.05 }}
                      className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[rgb(var(--c-s-50)/0.1)]"
                    >
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[rgb(var(--c-s-50))]" aria-hidden>
                        <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </motion.div>
                    <h3 className="text-body text-slate-50">Payment received</h3>
                    <button
                      type="button"
                      onClick={handleClose}
                      className="mt-6 w-full rounded-xl py-2.5 text-small font-medium text-slate-300 transition bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                    >
                      Done
                    </button>
                  </motion.div>
                )}

                {step === "pending" && (
                  <motion.div key="pending" variants={stepVariants} initial="enter" animate="center" exit="exit" className="py-2 text-center">
                    <motion.div
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ ...SPRING.lively, delay: 0.05 }}
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
    </AnimatePresence>,
    document.body,
  );
}

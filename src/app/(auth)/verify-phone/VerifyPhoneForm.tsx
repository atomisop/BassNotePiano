"use client";

import { useWebOtp } from "@/lib/useWebOtp";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RESEND_CLICKS_BEFORE_HELP, useResendCooldown } from "@/hooks/useResendCooldown";
import { cn } from "@/lib/utils";
import { fieldInvalid, fieldLabel } from "@/lib/form-styles";
import { formatPhone, PHONE_HELP } from "@/lib/phone";
import { startNavigation } from "@/lib/navigationState";
import { confirmPhoneAction, resendPhoneCodeAction, startPhoneAction } from "@/app/(dashboard)/account/phone-actions";
import { CHUNKED_CODE_LENGTH, chunkCode } from "@/lib/codeChunks";

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", bounce: 0, duration: 0.4 } },
};

export function VerifyPhoneForm({ pendingPhone, codeAlreadySent, callbackUrl }: { pendingPhone: string | null; codeAlreadySent: boolean; callbackUrl: string }) {
  const router = useRouter();
  const [number, setNumber] = useState(pendingPhone);
  // "number": typing one. "send": a number is waiting but no text went out yet. "code": a text is on its way.
  const [step, setStep] = useState<"number" | "send" | "code">(!pendingPhone ? "number" : codeAlreadySent ? "code" : "send");
  const [input, setInput] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cooldown = useResendCooldown();
  useWebOtp(step === "code", setCode);

  async function submitNumber(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const r = await startPhoneAction(input);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setNumber(r.phone);
    setCode("");
    setStep("code");
    cooldown.start();
  }

  async function sendCode() {
    setError(null);
    setBusy(true);
    const r = await resendPhoneCodeAction();
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setStep("code");
    cooldown.start();
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const r = await confirmPhoneAction(code);
    if (!r.ok) {
      setBusy(false);
      return setError(r.error);
    }
    startNavigation();
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <motion.div variants={cardVariants} initial="hidden" animate="visible" className="w-full glass-surface-elevated p-7">
      <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Last step</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Verify your phone</h1>

      {step === "number" && (
        <form onSubmit={submitNumber} className="mt-4 space-y-4">
          <p className="text-small text-slate-500">We text a 6-digit code to confirm it is really yours. {PHONE_HELP}</p>
          <div>
            <Label htmlFor="phone" className={fieldLabel}>
              Phone number
            </Label>
            <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" autoFocus required placeholder="(555) 123-4567" value={input} onChange={(e) => setInput(e.target.value)} aria-invalid={Boolean(error)} className={cn(error && fieldInvalid)} />
          </div>
          {error && <p role="alert" className="text-small text-red-400">{error}</p>}
          <Button type="submit" loading={busy} disabled={!input.trim()} className="cta-sheen w-full">
            {busy ? "Sending…" : "Text me a code"}
          </Button>
        </form>
      )}

      {step === "send" && number && (
        <div className="mt-4 space-y-4">
          <p className="text-small text-slate-500">
            We will text a 6-digit code to <span className="text-slate-300">{formatPhone(number)}</span>.
          </p>
          {error && <p role="alert" className="text-small text-red-400">{error}</p>}
          <Button type="button" onClick={sendCode} loading={busy} className="cta-sheen w-full">
            {busy ? "Sending…" : "Text me a code"}
          </Button>
          <Button type="button" onClick={() => { setError(null); setStep("number"); }} variant="secondary" size="sm" className="w-full">
            Use a different number
          </Button>
        </div>
      )}

      {step === "code" && number && (
        <>
          <p className="mt-2 text-small text-slate-500">
            Code sent to <span className="text-slate-300">{formatPhone(number)}</span>.
          </p>
          <form onSubmit={submitCode} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="code" className={fieldLabel}>
                Code
              </Label>
              <Input
                id="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={CHUNKED_CODE_LENGTH}
                required
                autoFocus
                aria-invalid={Boolean(error)}
                value={chunkCode(code)}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className={cn("h-12 text-center font-mono text-body tracking-[0.5em] font-semibold", error && fieldInvalid)}
                placeholder="······"
              />
            </div>
            {error && <p role="alert" className="text-small text-red-400">{error}</p>}
            <Button type="submit" disabled={code.length !== 6} loading={busy} className="cta-sheen w-full">
              {busy ? "Verifying…" : "Verify"}
            </Button>
          </form>
          <Button
            type="button"
            onClick={async () => {
              if (cooldown.secondsLeft > 0) return;
              await sendCode();
            }}
            disabled={cooldown.secondsLeft > 0 || busy}
            variant="secondary" size="sm" className="mt-4 w-full"
          >
            {cooldown.secondsLeft > 0 ? `You can ask again in ${cooldown.secondsLeft}s` : "Didn't get a text? Send it again"}
          </Button>
          <button type="button" onClick={() => { setError(null); setInput(""); setStep("number"); }} className="tap mt-2 w-full text-center text-small text-slate-500 transition hover:text-slate-300">
            Wrong number? Use a different one
          </button>
          {cooldown.clicks >= RESEND_CLICKS_BEFORE_HELP && (
            <p className="mt-3 text-center text-small text-slate-500">
              Still nothing? Email <a href="mailto:music@bassnotepiano.com" className="text-slate-50 underline hover:opacity-70">music@bassnotepiano.com</a> and we&apos;ll sort it out by hand.
            </p>
          )}
        </>
      )}
    </motion.div>
  );
}

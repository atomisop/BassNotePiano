"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Phone } from "lucide-react";
import { formatPhone, PHONE_HELP } from "@/lib/phone";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { useResendCooldown } from "@/hooks/useResendCooldown";
import { confirmPhoneAction, removePhoneAction, resendPhoneCodeAction, startPhoneAction } from "@/app/(dashboard)/account/phone-actions";

export interface PhoneState {
  phone: string | null;
  verified: boolean;
  pendingPhone: string | null;
  /** True for accounts made while a number was mandatory: they can change it but not remove it. */
  required: boolean;
  /** Whether verification texts can be sent right now. */
  smsAvailable: boolean;
}

const input = "w-full rounded-lg bg-neu-base px-3 py-2.5 text-body text-slate-100 shadow-pressed-low outline-none placeholder:text-slate-500";
const primary = "tap inline-flex items-center gap-2 rounded-lg bg-signal px-4 py-2 text-small font-semibold text-slate-950 shadow-raised-low disabled:cursor-not-allowed disabled:opacity-50";
const plain = "tap rounded-lg bg-neu-base px-3 py-2 text-small font-medium text-slate-300 shadow-raised-low active:shadow-pressed-low disabled:opacity-50";

/** Add, confirm, change or remove the account's phone number. The number only counts once its text code is entered. */
export function PhoneCard({ state }: { state: PhoneState }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const cooldown = useResendCooldown();
  // "view": showing the saved number. "number": typing one. "code": waiting for the text's code.
  const [mode, setMode] = useState<"view" | "number" | "code">(state.verified ? "view" : state.pendingPhone ? "code" : "number");
  const [number, setNumber] = useState(state.pendingPhone ?? "");
  const [pending, setPending] = useState(state.pendingPhone);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // The popup links here with #phone, and the tab only mounts after the page does, so scroll once it is here.
  // (Settings renders its content in two places, a desktop column and a phone panel, so this uses a ref
  // rather than an id; an id would be duplicated and the hidden copy would win.) Skipped when hidden.
  useEffect(() => {
    if (window.location.hash === "#phone" && ref.current && ref.current.offsetParent !== null) ref.current.scrollIntoView({ block: "center" });
  }, []);

  // Keep in step with the server: once the number shows as verified (here or in the other copy), show it.
  useEffect(() => {
    if (state.verified) {
      setMode("view");
      setPending(null);
    }
  }, [state.verified, state.phone]);

  async function send() {
    setBusy(true);
    setError(null);
    const r = await startPhoneAction(number);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setPending(r.phone);
    setCode("");
    setMode("code");
    cooldown.start();
  }

  async function resend() {
    if (cooldown.secondsLeft > 0) return;
    setBusy(true);
    setError(null);
    const r = await resendPhoneCodeAction();
    setBusy(false);
    if (!r.ok) return setError(r.error);
    cooldown.start();
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    const r = await confirmPhoneAction(code);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setDone(true);
    setMode("view");
    setPending(null);
    router.refresh();
  }

  async function remove() {
    if (!window.confirm("Remove your phone number from this account?")) return;
    setBusy(true);
    setError(null);
    const r = await removePhoneAction();
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setNumber("");
    setMode("number");
    router.refresh();
  }

  const shown = mode === "view" ? formatPhone(state.phone ?? "") : null;

  return (
    <div ref={ref} data-phone-card className="glass-surface p-6">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-body font-semibold text-slate-50">Phone number</h2>
        {state.verified && mode === "view" && (
          <span className="rounded-full bg-[rgb(var(--signal)/0.16)] px-2.5 py-0.5 text-small font-medium text-signal">Verified</span>
        )}
      </div>

      {!state.smsAvailable && !state.verified ? (
        <p className="mt-3 text-small text-slate-500">Text-message verification is not available yet. It will show up here when it is.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {done && <p role="status" className="text-small text-signal">Your phone number is verified.</p>}

          {mode === "view" && (
            <>
              <p className="flex items-center gap-2 text-body text-slate-100">
                <Phone className="h-4 w-4 text-slate-500" strokeWidth={1.5} /> {shown}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={plain} onClick={() => { setDone(false); setNumber(""); setMode("number"); }}>
                  Change number
                </button>
                {!state.required && (
                  <button type="button" className={`${plain} text-red-400`} disabled={busy} onClick={remove}>
                    Remove
                  </button>
                )}
              </div>
            </>
          )}

          {mode === "number" && (
            <>
              <p className="text-small text-slate-500">
                {state.verified ? "Enter your new number. Your current one stays until the new one is confirmed." : "Add a number and confirm it with a 6-digit text."} {PHONE_HELP}
              </p>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                aria-label="Phone number"
                placeholder="(555) 123-4567"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                className={input}
              />
              <div className="flex flex-wrap gap-2">
                <button type="button" className={primary} disabled={busy || !number.trim()} onClick={send}>
                  {busy && <MorphingSquare size={12} />} Text me a code
                </button>
                {state.verified && (
                  <button type="button" className={plain} onClick={() => { setError(null); setMode("view"); }}>
                    Cancel
                  </button>
                )}
              </div>
            </>
          )}

          {mode === "code" && pending && (
            <>
              <p className="text-small text-slate-500">
                Code sent to <span className="text-slate-300">{formatPhone(pending)}</span>.
              </p>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                aria-label="6-digit code"
                placeholder="······"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className={`${input} h-12 text-center font-mono tracking-[0.5em] font-semibold`}
              />
              <div className="flex flex-wrap gap-2">
                <button type="button" className={primary} disabled={busy || code.length !== 6} onClick={confirm}>
                  {busy && <MorphingSquare size={12} />} Verify
                </button>
                <button type="button" className={plain} disabled={busy || cooldown.secondsLeft > 0} onClick={resend}>
                  {cooldown.secondsLeft > 0 ? `Send again in ${cooldown.secondsLeft}s` : "Send it again"}
                </button>
                <button type="button" className={plain} onClick={() => { setError(null); setMode(state.verified ? "view" : "number"); }}>
                  Use a different number
                </button>
              </div>
            </>
          )}

          {error && <p role="alert" className="text-small text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}

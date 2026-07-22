"use client";

import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";

interface CodeGateProps {
  email: string;
  onConfirm: (code: string) => Promise<{ ok: boolean; error?: string }>;
  onResend: () => Promise<void>;
  onCancel: () => void;
  onSuccess: () => void;
}

/** Shared "enter the 6-digit code we just emailed you" step, reused by every gated change on this page. */
export function CodeGate({ email, onConfirm, onResend, onCancel, onSuccess }: CodeGateProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await onConfirm(code);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
      setSubmitting(false);
      return;
    }
    onSuccess();
  }

  async function handleResend() {
    setError(null);
    setResent(false);
    await onResend();
    setResent(true);
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={handleSubmit}
      className="mt-3 space-y-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4"
    >
      <p className="text-xs text-neutral-400">
        Enter the 6-digit code we sent to <span className="text-neutral-200">{email}</span> to confirm.
      </p>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        required
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-center font-mono text-lg tracking-[0.5em] text-neutral-100 outline-none transition focus:border-amber-400/60"
        placeholder="······"
      />

      {error && <p className="text-xs text-red-400">{error}</p>}
      {resent && <p className="text-xs text-emerald-400">New code sent.</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting || code.length !== 6}
          className="rounded-lg bg-amber-400 px-4 py-1.5 text-xs font-semibold text-neutral-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Confirming…" : "Confirm"}
        </button>
        <button
          type="button"
          onClick={handleResend}
          className="text-xs text-neutral-500 transition hover:text-amber-300"
        >
          Resend
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto text-xs text-neutral-500 transition hover:text-neutral-300"
        >
          Cancel
        </button>
      </div>
    </motion.form>
  );
}

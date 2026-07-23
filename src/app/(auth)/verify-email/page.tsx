"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { motion } from "framer-motion";
import { verifyEmailAction, resendVerificationEmailAction } from "./actions";

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 260, damping: 26 } },
};

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = await verifyEmailAction(email, code);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
      setSubmitting(false);
      return;
    }

    const signInResult = await signIn("credentials", { email, code: result.autoCode, redirect: false });
    if (signInResult?.error) {
      setError("Verified — but automatic login failed. Try logging in manually.");
      setSubmitting(false);
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  }

  async function handleResend() {
    setError(null);
    setResent(false);
    await resendVerificationEmailAction(email);
    setResent(true);
  }

  if (!email) {
    return (
      <motion.div
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        className="w-full max-w-sm glass-card p-7 text-center"
      >
        <p className="text-sm text-slate-400">
          Missing email.{" "}
          <Link href="/register" className="text-amber-300 transition hover:text-amber-200">
            Start over
          </Link>
          .
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className="w-full max-w-sm glass-card p-7"
    >
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Almost there</p>
      <h1 className="mt-1.5 font-serif text-2xl text-slate-50">Verify your email</h1>
      <p className="mt-2 text-sm text-slate-500">
        We sent a 6-digit code to <span className="text-slate-300">{email}</span>.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="code" className="mb-1 block text-xs font-medium text-slate-400">
            Code
          </label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-center font-mono text-lg tracking-[0.5em] text-slate-100 outline-none transition focus:border-amber-400/60"
            placeholder="······"
          />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}
        {resent && <p className="text-xs text-emerald-400">New code sent.</p>}

        <button
          type="submit"
          disabled={submitting || code.length !== 6}
          className="w-full rounded-xl bg-amber-400 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Verifying…" : "Verify"}
        </button>
      </form>

      <button
        type="button"
        onClick={handleResend}
        className="mt-4 w-full text-center text-sm text-slate-500 transition hover:text-amber-300"
      >
        Didn&apos;t get a code? Resend
      </button>
    </motion.div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  );
}

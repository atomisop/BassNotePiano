"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { motion } from "framer-motion";
import { resetPasswordAction, resendResetCodeAction } from "./actions";

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 260, damping: 26 } },
};

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";

  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    const result = await resetPasswordAction(email, code, newPassword);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
      setSubmitting(false);
      return;
    }

    const signInResult = await signIn("credentials", { email, code: result.autoCode, redirect: false });
    if (signInResult?.error) {
      setError("Password changed — but automatic login failed. Try logging in manually.");
      setSubmitting(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleResend() {
    setError(null);
    setResent(false);
    await resendResetCodeAction(email);
    setResent(true);
  }

  if (!email) {
    return (
      <motion.div
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900/60 p-7 text-center"
      >
        <p className="text-sm text-neutral-400">
          Missing email.{" "}
          <Link href="/forgot-password" className="text-amber-300 transition hover:text-amber-200">
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
      className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900/60 p-7"
    >
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Reset password</p>
      <h1 className="mt-1.5 font-serif text-2xl text-neutral-50">Choose a new password</h1>
      <p className="mt-2 text-sm text-neutral-500">
        We sent a 6-digit code to <span className="text-neutral-300">{email}</span>.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="code" className="mb-1 block text-xs font-medium text-neutral-400">
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
            className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-center font-mono text-lg tracking-[0.5em] text-neutral-100 outline-none transition focus:border-amber-400/60"
            placeholder="······"
          />
        </div>

        <div>
          <label htmlFor="newPassword" className="mb-1 block text-xs font-medium text-neutral-400">
            New password
          </label>
          <input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none transition focus:border-amber-400/60"
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="mb-1 block text-xs font-medium text-neutral-400">
            Confirm new password
          </label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none transition focus:border-amber-400/60"
          />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}
        {resent && <p className="text-xs text-emerald-400">New code sent.</p>}

        <button
          type="submit"
          disabled={submitting || code.length !== 6}
          className="w-full rounded-xl bg-amber-400 py-2.5 text-sm font-semibold text-neutral-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Resetting…" : "Reset password"}
        </button>
      </form>

      <button
        type="button"
        onClick={handleResend}
        className="mt-4 w-full text-center text-sm text-neutral-500 transition hover:text-amber-300"
      >
        Didn&apos;t get a code? Resend
      </button>
    </motion.div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

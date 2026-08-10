"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useErrorShake } from "@/lib/useErrorShake";

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", bounce: 0, duration: 0.4 } },
};

const MIN_PASSWORD_LENGTH = 8;

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const [name, setName] = useState("");
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const shakeControls = useErrorShake(error);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (!agreedToTerms) {
      setError("Please agree to the Terms & refund policy to continue.");
      return;
    }

    setSubmitting(true);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Something went wrong creating your account.");
      setSubmitting(false);
      return;
    }

    // Account exists but isn't usable yet — a verification code was just
    // emailed. Signing in happens at the end of that flow, not here.
    const params = new URLSearchParams({ email, callbackUrl });
    router.push(`/verify-email?${params}`);
  }

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className="w-full max-w-sm glass-surface-elevated p-7"
    >
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-ink/10 bg-ink/5 text-slate-300">
        <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
          <path
            d="M9 11a4 4 0 100-8 4 4 0 000 8zM3 21a6 6 0 0112 0M19 8v6M22 11h-6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h1 className="text-center font-serif text-2xl text-slate-50">Create your account</h1>
      <p className="mt-1.5 text-center text-sm text-slate-500">Sign up to get started.</p>

      <motion.form onSubmit={handleSubmit} animate={shakeControls} className="mt-6 space-y-4">
        <div>
          <label htmlFor="name" className="mb-1 block text-xs font-medium text-slate-400">
            Name
          </label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-ink/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-amber-400/60"
          />
        </div>
        <div>
          <label htmlFor="email" className="mb-1 block text-xs font-medium text-slate-400">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-ink/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-amber-400/60"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-xs font-medium text-slate-400">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            className={`w-full rounded-lg border bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-amber-400/60 ${
              error ? "border-red-400/60" : "border-ink/10"
            }`}
          />
        </div>
        <div>
          <label htmlFor="confirmPassword" className="mb-1 block text-xs font-medium text-slate-400">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setError(null);
            }}
            className={`w-full rounded-lg border bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-amber-400/60 ${
              error ? "border-red-400/60" : "border-ink/10"
            }`}
          />
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={agreedToTerms}
            onChange={(e) => {
              setAgreedToTerms(e.target.checked);
              setError(null);
            }}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-ink/10 bg-slate-950 accent-amber-400"
          />
          <span>
            I agree to the{" "}
            <Link href="/terms" target="_blank" className="text-amber-300 underline transition hover:text-amber-200">
              Terms &amp; refund policy
            </Link>
            .
          </span>
        </label>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="cta-sheen w-full rounded-xl bg-amber-400 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </motion.form>

      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="text-amber-300 transition hover:text-amber-200">
          Log in
        </Link>
      </p>
    </motion.div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}

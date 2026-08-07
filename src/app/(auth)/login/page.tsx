"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { motion } from "framer-motion";
import { useErrorShake } from "@/lib/useErrorShake";
import { loginStepOneAction } from "./actions";

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 260, damping: 26 } },
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const shakeControls = useErrorShake(error);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = await loginStepOneAction(email, password);

    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    if (result.needsEmailVerification) {
      const params = new URLSearchParams({ email, callbackUrl });
      router.push(`/verify-email?${params}`);
      return;
    }

    const signInResult = await signIn("credentials", { email, code: result.autoCode, redirect: false });
    if (signInResult?.error) {
      setError("Something went wrong logging in. Try again.");
      setSubmitting(false);
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className="w-full max-w-sm glass-surface-elevated p-7"
    >
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Welcome back</p>
      <h1 className="mt-1.5 font-serif text-2xl text-slate-50">Log in to continue</h1>
      <p className="mt-1.5 text-sm text-slate-500">Pick up your roadmap right where you left it.</p>

      <motion.form onSubmit={handleSubmit} animate={shakeControls} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-xs font-medium text-slate-400">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            className={`w-full rounded-lg border bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-amber-400/60 ${
              error ? "border-red-400/60" : "border-white/10"
            }`}
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="password" className="block text-xs font-medium text-slate-400">
              Password
            </label>
            <Link href="/forgot-password" className="text-xs text-slate-500 transition hover:text-amber-300">
              Forgot?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            className={`w-full rounded-lg border bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-amber-400/60 ${
              error ? "border-red-400/60" : "border-white/10"
            }`}
          />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="cta-sheen w-full rounded-xl bg-amber-400 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Logging in…" : "Continue"}
        </button>
      </motion.form>

      <p className="mt-6 text-center text-sm text-slate-500">
        New here?{" "}
        <Link href="/register" className="text-amber-300 transition hover:text-amber-200">
          Create an account
        </Link>
      </p>
    </motion.div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

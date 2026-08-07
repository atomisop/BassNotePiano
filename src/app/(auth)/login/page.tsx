"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { useErrorShake } from "@/lib/useErrorShake";
import { loginStepOneAction, resendLoginCodeAction, createTrustedDeviceAction } from "./actions";

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 260, damping: 26 } },
};

const stepVariants = {
  enter: { opacity: 0, x: 16 },
  center: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 30 } },
  exit: { opacity: 0, x: -16, transition: { duration: 0.15 } },
};

type Step = "password" | "code";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const [step, setStep] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const shakeControls = useErrorShake(error);

  async function completeSignIn(codeToSubmit: string) {
    const result = await signIn("credentials", { email, code: codeToSubmit, redirect: false });
    if (result?.error) {
      setError("That code isn't right or has expired.");
      setSubmitting(false);
      return;
    }

    if (rememberMe) {
      await createTrustedDeviceAction(email);
    }

    router.push(callbackUrl);
    router.refresh();
  }

  async function handlePasswordSubmit(e: FormEvent) {
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

    if (result.autoCode) {
      // Trusted device — sign in immediately with the silently-issued code, no code screen shown.
      await completeSignIn(result.autoCode);
      return;
    }

    setSubmitting(false);
    setStep("code");
  }

  async function handleCodeSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    await completeSignIn(code);
  }

  async function handleResend() {
    setError(null);
    setResent(false);
    await resendLoginCodeAction(email);
    setResent(true);
  }

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className="w-full max-w-sm glass-surface-elevated p-7"
    >
      <AnimatePresence mode="wait">
        {step === "password" ? (
          <motion.div key="password" variants={stepVariants} initial="enter" animate="center" exit="exit">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Welcome back</p>
            <h1 className="mt-1.5 font-serif text-2xl text-slate-50">Log in to continue</h1>
            <p className="mt-1.5 text-sm text-slate-500">Pick up your roadmap right where you left it.</p>

            <motion.form onSubmit={handlePasswordSubmit} animate={shakeControls} className="mt-6 space-y-4">
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
                {submitting ? "Checking…" : "Continue"}
              </button>
            </motion.form>

            <p className="mt-6 text-center text-sm text-slate-500">
              New here?{" "}
              <Link href="/register" className="text-amber-300 transition hover:text-amber-200">
                Create an account
              </Link>
            </p>
          </motion.div>
        ) : (
          <motion.div key="code" variants={stepVariants} initial="enter" animate="center" exit="exit">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Confirm it's you</p>
            <h1 className="mt-1.5 font-serif text-2xl text-slate-50">Enter your code</h1>
            <p className="mt-2 text-sm text-slate-500">
              We sent a 6-digit code to <span className="text-slate-300">{email}</span>.
            </p>

            <motion.form onSubmit={handleCodeSubmit} animate={shakeControls} className="mt-6 space-y-4">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, ""));
                  setError(null);
                }}
                className={`w-full rounded-lg border bg-slate-950 px-3 py-2 text-center font-mono text-lg tracking-[0.5em] text-slate-100 outline-none transition-colors focus:border-amber-400/60 ${
                  error ? "border-red-400/60" : "border-white/10"
                }`}
                placeholder="······"
              />

              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-400">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 cursor-pointer rounded border-white/15 bg-slate-950 accent-amber-400"
                />
                Remember me for 7 days
              </label>

              {error && <p className="text-xs text-red-400">{error}</p>}
              {resent && <p className="text-xs text-emerald-400">New code sent.</p>}

              <button
                type="submit"
                disabled={submitting || code.length !== 6}
                className="cta-sheen w-full rounded-xl bg-amber-400 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Logging in…" : "Log in"}
              </button>
            </motion.form>

            <div className="mt-4 flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => {
                  setStep("password");
                  setCode("");
                  setError(null);
                }}
                className="text-slate-500 transition hover:text-slate-300"
              >
                Back
              </button>
              <button type="button" onClick={handleResend} className="text-slate-500 transition hover:text-amber-300">
                Resend code
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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

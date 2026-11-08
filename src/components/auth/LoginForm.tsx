"use client";

import { PAYMENT_LOCKED_CODE, PAYMENT_LOCKED_PATH } from "@/lib/paymentLockCodes";
import { useEffect, useState, type FormEvent } from "react";
import { safeCallbackPath } from "@/lib/safeRedirect";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { BANNED_ERROR_CODE, BANNED_MESSAGE } from "@/lib/ban";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { fieldInvalid, fieldLabel } from "@/lib/form-styles";
import { useErrorShake } from "@/lib/useErrorShake";
import { loginStepOneAction, requestLoginCodeAction } from "@/app/(auth)/login/actions";
import { startNavigation } from "@/lib/navigationState";
import { CHUNKED_CODE_LENGTH, chunkCode } from "@/lib/codeChunks";
import { Hint } from "@/components/ui/Hint";

/**
 * The email-and-password login form, shared by the /login page and the Log in
 * panel that slides out from the site header. Email and password sit on one
 * screen (a two-step "email first" form breaks password managers), with the
 * right autocomplete hints so a saved login fills in with one tap.
 *
 * `embedded` is the panel version: after a successful login it calls
 * `onSuccess` (to close the panel) and refreshes in place, staying on the page
 * the visitor was on, instead of navigating away. The page version goes to
 * `callbackUrl`.
 */
/** A sign-in error in red; the ban notice gets a stronger red box so it cannot be missed. */
function FormError({ message }: { message: string }) {
  if (message === BANNED_MESSAGE) {
    return (
      <p role="alert" className="rounded-xl border border-red-500/50 bg-neu-base shadow-pressed-low px-4 py-3 text-small font-semibold text-red-400">
        {message}
      </p>
    );
  }
  return (
    <p role="alert" className="text-small text-red-400">
      {message}
    </p>
  );
}

export function LoginForm({
  callbackUrl,
  embedded = false,
  onSuccess,
  onNavigateAway,
}: {
  callbackUrl: string;
  embedded?: boolean;
  onSuccess?: () => void;
  /** Called just before leaving for another page (e.g. /register), so a panel can close first. */
  onNavigateAway?: () => void;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Admins with two-step sign-in on are asked for a code after the right password.
  const [needsSecondStep, setNeedsSecondStep] = useState(false);
  const [secondStep, setSecondStep] = useState("");
  const shakeControls = useErrorShake(error);

  // "Email me a code instead": enter your email, we send a 6-digit code, type
  // it in. No password needed.
  const [method, setMethod] = useState<"password" | "code">("password");
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  // A computer gets the cursor in the email field right away. A phone does not: focusing on
  // load opens the keyboard and shoves the page up before anyone has touched it.
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) document.getElementById(embedded ? "panel-email" : "email")?.focus();
  }, [embedded]);

  function finishLogin() {
    // Logged in means into the signed-in app: the Log in panel on the public pages
    // goes to the dashboard, and a plain "/" callback does too. Only a real in-app
    // destination (a relative path) is kept.
    const safe = safeCallbackPath(callbackUrl);
    const target = embedded || safe === "/" ? "/dashboard" : safe;
    if (embedded) onSuccess?.();
    startNavigation();
    router.push(target);
    router.refresh();
  }

  async function handleSendCode(e?: FormEvent) {
    e?.preventDefault();
    if (!email.trim() || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await requestLoginCodeAction(email);
      setCodeSent(true);
      setCode("");
      setResendIn(30);
    } catch {
      setError("Couldn't send the code. Check your connection and try again.");
    }
    setSubmitting(false);
  }

  async function submitCode(value: string) {
    if (value.length !== 6 || submitting) return;
    setError(null);
    setSubmitting(true);
    const result = await signIn("credentials", { email, code: value, redirect: false });
    if (result?.error) {
      if (result.error === PAYMENT_LOCKED_CODE) return window.location.assign(PAYMENT_LOCKED_PATH);
      setError(result.error === BANNED_ERROR_CODE ? BANNED_MESSAGE : "That code didn't work. Check it and try again, or request a new one.");
      setCode("");
      setSubmitting(false);
      return;
    }
    finishLogin();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = await loginStepOneAction(email, password, needsSecondStep ? secondStep : undefined);

    if (!result.ok) {
      if (result.error === PAYMENT_LOCKED_CODE) return window.location.assign(PAYMENT_LOCKED_PATH);
      setError(result.error);
      setSubmitting(false);
      return;
    }

    if ("needsSecondStep" in result) {
      setNeedsSecondStep(true);
      setSubmitting(false);
      return;
    }

    if (result.needsEmailVerification) {
      const params = new URLSearchParams({ email, callbackUrl });
      onNavigateAway?.();
      router.push(`/verify-email?${params}`);
      return;
    }

    const signInResult = await signIn("credentials", { email, code: result.autoCode, secondStep: needsSecondStep ? secondStep : undefined, redirect: false });
    if (signInResult?.error) {
      if (signInResult.error === PAYMENT_LOCKED_CODE) return window.location.assign(PAYMENT_LOCKED_PATH);
      setError(signInResult.error === BANNED_ERROR_CODE ? BANNED_MESSAGE : "Something went wrong logging in. Try again.");
      setSubmitting(false);
      return;
    }

    finishLogin();
  }

  if (method === "code") {
    const emailId = embedded ? "panel-code-email" : "code-email";
    const codeId = embedded ? "panel-code" : "code";
    return (
      <>
        <motion.div animate={shakeControls} className="space-y-4">
          {!codeSent ? (
            <form onSubmit={handleSendCode} className="space-y-4">
              <div>
                <Label htmlFor={emailId} className={fieldLabel}>
                  Email
                </Label>
                <Input
                  id={emailId}
                  name="email"
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                />
              </div>
              {error && (
                <FormError message={error} />
              )}
              <Button type="submit" loading={submitting} className="cta-sheen w-full">
                {submitting ? "Sending…" : "Email me a code"}
              </Button>
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submitCode(code);
              }}
              className="space-y-4"
            >
              <p className="text-small text-slate-400">
                If <span className="text-slate-200">{email.trim()}</span> has an account, a code is on its way. Nothing
                after a minute? Check spam, or{" "}
                <Link href="/register" onClick={onNavigateAway} className="text-slate-50 underline underline-offset-4 transition hover:opacity-70">
                  create an account
                </Link>
                .
              </p>
              <div>
                <Label htmlFor={codeId} className={fieldLabel}>
                  6-digit code
                </Label>
                <Input
                  id={codeId}
                  name="one-time-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9 ]*"
                  maxLength={CHUNKED_CODE_LENGTH}
                  required
                  autoFocus
                  aria-invalid={Boolean(error)}
                  value={chunkCode(code)}
                  onChange={(e) => {
                    const next = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setCode(next);
                    setError(null);
                    if (next.length === 6) void submitCode(next);
                  }}
                  className={cn("text-center tracking-[0.4em]", error && fieldInvalid)}
                />
              </div>
              {error && (
                <FormError message={error} />
              )}
              <Button type="submit" loading={submitting} disabled={code.length !== 6} className="cta-sheen w-full">
                {submitting ? "Logging in…" : "Log in"}
              </Button>
              <div className="flex items-center justify-between text-small">
                <button
                  type="button"
                  disabled={resendIn > 0 || submitting}
                  onClick={() => void handleSendCode()}
                  className="tap text-slate-400 transition hover:text-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {resendIn > 0 ? `Send again in ${resendIn}s` : "Send a new code"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCodeSent(false);
                    setCode("");
                    setError(null);
                  }}
                  className="tap text-slate-400 transition hover:text-slate-50"
                >
                  Different email
                </button>
              </div>
            </form>
          )}
        </motion.div>

        <button
          type="button"
          onClick={() => {
            setMethod("password");
            setError(null);
          }}
          className="tap mt-5 block w-full text-center text-small text-slate-400 transition hover:text-slate-50"
        >
          Use my password instead
        </button>

        <p className="mt-4 text-center text-small text-slate-500">
          New here?{" "}
          <Link href="/register" onClick={onNavigateAway} className="text-slate-50 underline underline-offset-4 transition hover:opacity-70">
            Create an account
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <motion.form onSubmit={handleSubmit} animate={shakeControls} className="space-y-4">
        <div>
          <Label htmlFor={embedded ? "panel-email" : "email"} className={fieldLabel}>
            Email
          </Label>
          <Input
            id={embedded ? "panel-email" : "email"}
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            aria-invalid={Boolean(error)}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            className={cn(error && fieldInvalid)}
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <Label htmlFor={embedded ? "panel-password" : "password"} className={fieldLabel}>
              Password
            </Label>
            <Link
              href="/forgot-password"
              onClick={onNavigateAway}
              className="tap inline-flex items-center text-small text-slate-500 transition hover:text-slate-50"
            >
              Forgot?
            </Link>
          </div>
          <PasswordInput
            id={embedded ? "panel-password" : "password"}
            name="password"
            autoComplete="current-password"
            required
            aria-invalid={Boolean(error)}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            className={cn(error && fieldInvalid)}
          />
        </div>

        {needsSecondStep && (
          <div>
            <Label htmlFor={embedded ? "panel-second-step" : "second-step"} className={fieldLabel}>
              Authenticator code
            </Label>
            <Input
              id={embedded ? "panel-second-step" : "second-step"}
              name="one-time-code"
              autoComplete="one-time-code"
              autoFocus
              required
              placeholder="6 digits, or a backup code"
              value={secondStep}
              onChange={(e) => {
                setSecondStep(e.target.value);
                setError(null);
              }}
            />
            <p className="mt-1 text-small text-slate-500"><Hint>Open your authenticator app. Lost your phone? Type one of your backup codes instead.</Hint></p>
          </div>
        )}

        {error && (
          <FormError message={error} />
        )}

        <Button type="submit" loading={submitting} className="cta-sheen w-full">
          {submitting ? "Logging in…" : "Log in"}
        </Button>
      </motion.form>

      <button
        type="button"
        onClick={() => {
          setMethod("code");
          setCodeSent(false);
          setError(null);
        }}
        className="tap mt-3 block w-full text-center text-small text-slate-400 transition hover:text-slate-50"
      >
        Email me a code instead
      </button>

      <p className="mt-6 text-center text-small text-slate-500">
        New here?{" "}
        <Link href="/register" onClick={onNavigateAway} className="text-slate-50 underline underline-offset-4 transition hover:opacity-70">
          Create an account
        </Link>
      </p>
    </>
  );
}

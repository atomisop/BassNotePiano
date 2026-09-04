"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { CheckIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { fieldInvalid, fieldLabel } from "@/lib/form-styles";
import { useErrorShake } from "@/lib/useErrorShake";
import { resetPasswordAction, resendResetCodeAction } from "./actions";

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", bounce: 0, duration: 0.4 } },
};

// Matches actions.ts's own constant of the same name (and register's). This
// form used to enforce nothing client-side, so the length rule only ever
// surfaced as a submit-time rejection.
const MIN_PASSWORD_LENGTH = 8;

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
  const shakeControls = useErrorShake(error);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
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
        className="w-full max-w-sm glass-surface-elevated p-7 text-center"
      >
        <p className="text-sm text-slate-400">
          Missing email.{" "}
          <Link href="/forgot-password" className="text-[rgb(var(--c-a-300))] transition hover:text-[rgb(var(--c-a-200))]">
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
      className="w-full max-w-sm glass-surface-elevated p-7"
    >
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-a-400)/0.8)]">Reset password</p>
      <h1 className="mt-1.5 font-serif text-2xl text-slate-50">Choose a new password</h1>
      <p className="mt-2 text-sm text-slate-500">
        We sent a 6-digit code to <span className="text-slate-300">{email}</span>.
      </p>

      <motion.form onSubmit={handleSubmit} animate={shakeControls} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="code" className={fieldLabel}>
            Code
          </Label>
          {/* Same taller mono treatment as /verify-email — both screens ask
              for the identical 6-digit code, so they read identically. */}
          <Input
            id="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            autoFocus
            aria-invalid={Boolean(error)}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, ""));
              setError(null);
            }}
            className={cn(
              "h-12 text-center font-mono text-lg tracking-[0.5em]",
              error && fieldInvalid,
            )}
            placeholder="······"
          />
        </div>

        <div>
          <Label htmlFor="newPassword" className={fieldLabel}>
            New password
          </Label>
          <PasswordInput
            id="newPassword"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            aria-invalid={Boolean(error)}
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              setError(null);
            }}
            className={cn(error && fieldInvalid)}
          />
          {newPassword.length > 0 && (
            <p className={`mt-1.5 flex items-center gap-1.5 text-xs ${newPassword.length >= MIN_PASSWORD_LENGTH ? "text-emerald-400" : "text-slate-500"}`}>
              <CheckIcon size={11} className={newPassword.length >= MIN_PASSWORD_LENGTH ? "opacity-100" : "opacity-30"} />
              At least {MIN_PASSWORD_LENGTH} characters
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="confirmPassword" className={fieldLabel}>
            Confirm new password
          </Label>
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            aria-invalid={Boolean(error)}
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setError(null);
            }}
            className={cn(error && fieldInvalid)}
          />
          {confirmPassword.length > 0 && (
            <p className={`mt-1.5 flex items-center gap-1.5 text-xs ${newPassword === confirmPassword ? "text-emerald-400" : "text-slate-500"}`}>
              <CheckIcon size={11} className={newPassword === confirmPassword ? "opacity-100" : "opacity-30"} />
              {newPassword === confirmPassword ? "Passwords match" : "Passwords don't match yet"}
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="text-xs text-red-400">
            {error}
          </p>
        )}
        {resent && (
          <p role="status" className="text-xs text-emerald-400">
            New code sent.
          </p>
        )}

        <Button type="submit" disabled={submitting || code.length !== 6} className="cta-sheen w-full">
          {submitting ? "Resetting…" : "Reset password"}
        </Button>
      </motion.form>

      <button
        type="button"
        onClick={handleResend}
        className="mt-4 w-full text-center text-sm text-slate-500 transition hover:text-[rgb(var(--c-a-300))]"
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

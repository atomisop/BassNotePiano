"use client";

import { PAYMENT_LOCKED_CODE, PAYMENT_LOCKED_PATH } from "@/lib/paymentLockCodes";
import { MIN_PASSWORD_LENGTH, passwordRequirementError } from "@/lib/passwordRules";
import { PasswordStrength } from "@/components/ui/password-strength";
import { BANNED_ERROR_CODE, BANNED_MESSAGE } from "@/lib/ban";
import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { RESEND_CLICKS_BEFORE_HELP, useResendCooldown } from "@/hooks/useResendCooldown";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { CheckIcon, ArrowLeftIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { fieldInvalid, fieldLabel } from "@/lib/form-styles";
import { useErrorShake } from "@/lib/useErrorShake";
import { resetPasswordAction, resendResetCodeAction } from "./actions";
import { BackLink } from "@/components/ui/BackLink";
import { CHUNKED_CODE_LENGTH, chunkCode } from "@/lib/codeChunks";

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", bounce: 0, duration: 0.4 } },
};

// Matches actions.ts's own constant of the same name (and register's). This
// form used to enforce nothing client-side, so the length rule only ever
// surfaced as a submit-time rejection.

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

    const passwordError = passwordRequirementError(newPassword);
    if (passwordError) {
      setError(passwordError);
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
      if (signInResult.error === PAYMENT_LOCKED_CODE) return window.location.assign(PAYMENT_LOCKED_PATH);
      setError(signInResult.error === BANNED_ERROR_CODE ? BANNED_MESSAGE : "Password changed, but automatic login failed. Try logging in manually.");
      setSubmitting(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  const cooldown = useResendCooldown();

  async function handleResend() {
    if (cooldown.secondsLeft > 0) return;
    setError(null);
    setResent(false);
    try {
      const result = await resendResetCodeAction(email);
      if (!result.ok) {
        setError(result.error);
        return;
      }
    } catch {
      setError("That didn't go through. Check your connection and try again.");
      return;
    }
    setResent(true);
    cooldown.start();
  }

  if (!email) {
    return (
      <motion.div
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        className="w-full glass-surface-elevated p-6 text-center sm:p-7"
      >
        <p className="text-small text-slate-400">
          Missing email.{" "}
          <Link href="/forgot-password" className="font-medium text-slate-300 underline decoration-slate-500 underline-offset-4 transition hover:text-slate-50">
            Start over
          </Link>
          .
        </p>
      </motion.div>
    );
  }

  return (
    // Padding/gaps below step down on narrow phones (`sm:` restores the
    // original spacing everywhere else), this is the tallest auth screen
    // (three fields, each with its own hint line, vs. one or two elsewhere),
    // and the shared (auth)/layout.tsx shell was leaving it just short of
    // fitting one real phone viewport without a scroll. See that layout's
    // own comment for the shell-level half of this fix (svh + its padding).
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className="w-full glass-surface-elevated p-5 sm:p-7"
    >
      {/* Codes get mistyped, or someone starts this flow and changes their
          mind about which account to sign into. The only way out used to
          be the logo up in the layout header, which leaves the whole
          reset flow for the marketing homepage rather than back to login. */}
      <BackLink href="/login" className="tap w-fit mb-3 flex items-center gap-1.5 text-small text-slate-500 transition hover:text-slate-300 sm:mb-4">
        <ArrowLeftIcon size={16} />
        Back
      </BackLink>
      <p className="text-caption font-medium uppercase tracking-caps text-slate-500">Reset password</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1 text-slate-50">Choose a new password</h1>
      <p className="mt-1.5 text-small text-slate-500 sm:mt-2">
        Code sent to <span className="text-slate-300">{email}</span>.
      </p>

      <motion.form onSubmit={handleSubmit} animate={shakeControls} className="mt-3 space-y-2 sm:mt-6 sm:space-y-4">
        <div>
          <Label htmlFor="code" className={fieldLabel}>
            Code
          </Label>
          {/* Same taller mono treatment as /verify-email, both screens ask
              for the identical 6-digit code, so they read identically. */}
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
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, ""));
              setError(null);
            }}
            className={cn(
              "h-12 text-center font-mono text-body tracking-[0.5em] font-semibold",
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
          {newPassword.length > 0 && <PasswordStrength value={newPassword} className="mt-3" />}
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
            <p className={`mt-1.5 flex items-center gap-1.5 text-small ${newPassword === confirmPassword ? "text-slate-50" : "text-slate-500"}`}>
              <CheckIcon size={11} className={newPassword === confirmPassword ? "opacity-100" : "opacity-30"} />
              {newPassword === confirmPassword ? "Passwords match" : "Passwords don't match yet"}
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="text-small text-red-400">
            {error}
          </p>
        )}
        {resent && (
          <p role="status" className="text-small text-slate-300">
            If this address has an account, a new code is on its way. It can take a minute, and it may land in spam.
          </p>
        )}

        <Button type="submit" disabled={code.length !== 6} loading={submitting} className="cta-sheen w-full">
          {submitting ? "Resetting…" : "Reset password"}
        </Button>
      </motion.form>

      <button
        type="button"
        onClick={handleResend}
        disabled={cooldown.secondsLeft > 0}
        className="tap mt-3 block w-full text-center text-small text-slate-400 transition hover:text-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:mt-4"
      >
        {cooldown.secondsLeft > 0 ? `You can ask again in ${cooldown.secondsLeft}s` : "Didn't get a code? Resend"}
      </button>
      {cooldown.clicks >= RESEND_CLICKS_BEFORE_HELP && (
        <p className="mt-3 text-center text-small text-slate-500">
          Still nothing? Email <a href="mailto:music@bassnotepiano.com" className="font-medium text-slate-300 underline decoration-slate-500 underline-offset-4 transition hover:text-slate-50">music@bassnotepiano.com</a> and we&apos;ll sort it out by hand.
        </p>
      )}
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

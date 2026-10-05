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
import { CheckIcon, ArrowLeftIcon } from "@/components/ui/icons";
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
      setError("Password changed, but automatic login failed. Try logging in manually.");
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
        className="w-full glass-surface-elevated p-6 text-center sm:p-7"
      >
        <p className="text-small text-slate-400">
          Missing email.{" "}
          <Link href="/forgot-password" className="text-[rgb(var(--c-s-50))] transition hover:opacity-70">
            Start over
          </Link>
          .
        </p>
      </motion.div>
    );
  }

  return (
    // Padding/gaps below step down on narrow phones (`sm:` restores the
    // original spacing everywhere else) — this is the tallest auth screen
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
      <Link href="/login" className="tap w-fit mb-3 flex items-center gap-1.5 text-small text-slate-500 transition hover:text-slate-300 sm:mb-4">
        <ArrowLeftIcon size={16} />
        Back to login
      </Link>
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Reset password</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Choose a new password</h1>
      <p className="mt-1.5 text-small text-slate-500 sm:mt-2">
        Code sent to <span className="text-slate-300">{email}</span>.
      </p>

      <motion.form onSubmit={handleSubmit} animate={shakeControls} className="mt-3 space-y-2 sm:mt-6 sm:space-y-4">
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
          {newPassword.length > 0 && (
            <p className={`mt-1.5 flex items-center gap-1.5 text-small ${newPassword.length >= MIN_PASSWORD_LENGTH ? "text-slate-50" : "text-slate-500"}`}>
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
          <p role="status" className="text-small text-slate-50">
            New code sent.
          </p>
        )}

        <Button type="submit" disabled={code.length !== 6} loading={submitting} className="cta-sheen w-full">
          {submitting ? "Resetting…" : "Reset password"}
        </Button>
      </motion.form>

      <button
        type="button"
        onClick={handleResend}
        className="mt-2 w-full text-center text-small text-slate-500 transition hover:text-[rgb(var(--c-s-50))] sm:mt-4"
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

"use client";

import { BANNED_ERROR_CODE, BANNED_MESSAGE } from "@/lib/ban";
import { safeCallbackPath } from "@/lib/safeRedirect";
import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { motion } from "framer-motion";
import { Button, buttonVariants } from "@/components/ui/button";
import { RESEND_CLICKS_BEFORE_HELP, useResendCooldown } from "@/hooks/useResendCooldown";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { fieldInvalid, fieldLabel } from "@/lib/form-styles";
import { verifyEmailAction, resendVerificationEmailAction } from "./actions";
import { startNavigation } from "@/lib/navigationState";
import { BackLink } from "@/components/ui/BackLink";

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", bounce: 0, duration: 0.4 } },
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
      setError(signInResult.error === BANNED_ERROR_CODE ? BANNED_MESSAGE : "Verified, but automatic login failed. Try logging in manually.");
      setSubmitting(false);
      return;
    }

    startNavigation();
    // A new account still has to confirm its phone number, which is part of creating it.
    if (result.needsPhone) {
      router.push(`/verify-phone?${new URLSearchParams({ callbackUrl: safeCallbackPath(callbackUrl), ...(result.phoneCodeSent ? { sent: "1" } : {}) })}`);
      router.refresh();
      return;
    }
    router.push(safeCallbackPath(callbackUrl));
    router.refresh();
  }

  const cooldown = useResendCooldown();

  async function handleResend() {
    if (cooldown.secondsLeft > 0) return;
    setError(null);
    setResent(false);
    try {
      const result = await resendVerificationEmailAction(email);
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
        className="w-full glass-surface-elevated p-7 text-center"
      >
        <p className="text-small text-slate-400">
          Missing email.{" "}
          <Link href="/register" className="text-[rgb(var(--c-s-50))] transition hover:opacity-70">
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
      className="w-full glass-surface-elevated p-7"
    >
      {/* Matches the "missing email" branch's own escape hatch below:
          register, not login, since there's no verified account to log
          into yet at this step. */}
      <BackLink href="/register" className="tap w-fit mb-4 flex items-center gap-1.5 text-small text-slate-500 transition hover:text-slate-300">
        <ArrowLeftIcon size={16} />
        Back
      </BackLink>
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Almost there</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Verify your email</h1>
      <p className="mt-2 text-small text-slate-500">
        Code sent to <span className="text-slate-300">{email}</span>.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="code" className={fieldLabel}>
            Code
          </Label>
          {/* Taller than the standard 40px field and centred in mono: a
              6-digit code is read back digit-by-digit against the email, not
              skimmed like a name, so the extra height and tracking are doing
              real work here rather than decorating. */}
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
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className={cn(
              "h-12 text-center font-mono text-body tracking-[0.5em] font-semibold",
              error && fieldInvalid,
            )}
            placeholder="······"
          />
        </div>

        {error && (
          <p role="alert" className="text-small text-red-400">
            {error}
          </p>
        )}
        {resent && (
          <p role="status" className="text-small text-slate-50">
            If this address has an account, a new code is on its way. It can take a minute, and it may land in spam.
          </p>
        )}

        <Button type="submit" disabled={code.length !== 6} loading={submitting} className="cta-sheen w-full">
          {submitting ? "Verifying…" : "Verify"}
        </Button>
      </form>

      <button
        type="button"
        onClick={handleResend}
        disabled={cooldown.secondsLeft > 0}
        className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-4 w-full" })}
      >
        {cooldown.secondsLeft > 0 ? `You can ask again in ${cooldown.secondsLeft}s` : "Didn't get a code? Resend"}
      </button>
      {cooldown.clicks >= RESEND_CLICKS_BEFORE_HELP && (
        <p className="mt-3 text-center text-small text-slate-500">
          Still nothing? Email <a href="mailto:music@bassnotepiano.com" className="text-[rgb(var(--c-s-50))] underline hover:opacity-70">music@bassnotepiano.com</a> and we&apos;ll sort it out by hand.
        </p>
      )}
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

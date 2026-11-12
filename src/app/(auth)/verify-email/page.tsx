"use client";

import { PAYMENT_LOCKED_CODE, PAYMENT_LOCKED_PATH } from "@/lib/paymentLockCodes";
import { BANNED_ERROR_CODE, BANNED_MESSAGE } from "@/lib/ban";
import { safeCallbackPath } from "@/lib/safeRedirect";
import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { RESEND_CLICKS_BEFORE_HELP, useResendCooldown } from "@/hooks/useResendCooldown";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { fieldInvalid, fieldLabel } from "@/lib/form-styles";
import { verifyEmailAction, resendVerificationEmailAction, changeSignupEmailAction } from "./actions";
import { startNavigation } from "@/lib/navigationState";
import { BackLink } from "@/components/ui/BackLink";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { CHUNKED_CODE_LENGTH, chunkCode } from "@/lib/codeChunks";
import { PasswordInput } from "@/components/ui/password-input";
import { EmailTypoHint } from "@/components/auth/EmailTypoHint";
import { clearSignupDraft, readSignupDraft, saveSignupDraft } from "@/lib/signupDraft";

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
  // Sign-up could not email the first code: say so up front and let them tap Resend, rather than wait for mail that was never sent.
  const [error, setError] = useState<string | null>(
    searchParams.get("sendFailed") === "1" ? "We couldn't email your code just now. Tap Resend below to try again." : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [resent, setResent] = useState(false);
  // "Wrong email?": fix a typo here instead of starting the whole form again.
  const [changing, setChanging] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [changePassword, setChangePassword] = useState("");
  const [changeBusy, setChangeBusy] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [changedTo, setChangedTo] = useState<string | null>(null);

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
      if (signInResult.error === PAYMENT_LOCKED_CODE) return window.location.assign(PAYMENT_LOCKED_PATH);
      setError(signInResult.error === BANNED_ERROR_CODE ? BANNED_MESSAGE : "Verified, but automatic login failed. Try logging in manually.");
      setSubmitting(false);
      return;
    }

    // Confirmed: the sign-up form no longer needs to remember anything.
    clearSignupDraft();
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

  async function handleChangeEmail(e: FormEvent) {
    e.preventDefault();
    setChangeError(null);
    setChangeBusy(true);
    try {
      const result = await changeSignupEmailAction(email, changePassword, newEmail);
      if (!result.ok) {
        setChangeError(result.error);
        return;
      }
      // Back on the sign-up form the corrected address is waiting too.
      saveSignupDraft({ name: readSignupDraft()?.name ?? "", email: result.email });
      setChanging(false);
      setNewEmail("");
      setChangePassword("");
      setCode("");
      setResent(false);
      setError(result.emailSent ? null : "We changed your email but couldn't send the code just now. Tap Resend below to try again.");
      setChangedTo(result.emailSent ? result.email : null);
      if (result.emailSent) cooldown.start();
      const params = new URLSearchParams({ email: result.email, callbackUrl });
      router.replace(`/verify-email?${params}`);
    } catch {
      setChangeError("That didn't go through. Check your connection and try again.");
    } finally {
      setChangeBusy(false);
    }
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
          <Link href="/register" className="font-medium text-slate-300 underline decoration-slate-500 underline-offset-4 transition hover:text-slate-50">
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
      <AuthHeading title="Verify your email">
        Code sent to <span className="text-slate-200">{email}</span>.
      </AuthHeading>
      {!changing && (
        <button
          type="button"
          onClick={() => setChanging(true)}
          className="tap mt-1 inline-flex items-center text-small font-medium text-slate-300 underline decoration-slate-500 underline-offset-4 transition hover:text-slate-50"
        >
          Wrong email? Change it
        </button>
      )}
      {changing && (
        <form onSubmit={handleChangeEmail} className="mt-4 space-y-3 rounded-xl bg-slate-50/5 p-4">
          <div>
            <Label htmlFor="new-email" className={fieldLabel}>
              Correct email
            </Label>
            <Input id="new-email" type="email" autoComplete="email" spellCheck={false} required autoFocus value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            <EmailTypoHint value={newEmail} onFix={setNewEmail} />
          </div>
          <div>
            <Label htmlFor="change-password" className={fieldLabel}>
              Your password
            </Label>
            <PasswordInput id="change-password" autoComplete="current-password" required value={changePassword} onChange={(e) => setChangePassword(e.target.value)} />
            <p className="mt-1.5 text-small text-slate-500">The one you just chose. It shows this is you.</p>
          </div>
          {changeError && (
            <p role="alert" className="text-small text-red-400">
              {changeError}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" loading={changeBusy} className="flex-1">
              {changeBusy ? "Sending…" : "Send code to this email"}
            </Button>
            <button
              type="button"
              onClick={() => {
                setChanging(false);
                setChangeError(null);
              }}
              className="tap inline-flex items-center px-2 text-small text-slate-400 transition hover:text-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {changedTo && (
        <p role="status" className="mt-3 text-small text-slate-300">
          Email changed. A new code is on its way to {changedTo}.
        </p>
      )}

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
            maxLength={CHUNKED_CODE_LENGTH}
            required
            autoFocus
            aria-invalid={Boolean(error)}
            value={chunkCode(code)}
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
          <p role="status" className="text-small text-slate-300">
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
        className="tap mt-4 block w-full text-center text-small text-slate-400 transition hover:text-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  );
}

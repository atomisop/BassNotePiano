"use client";

import { safeCallbackPath } from "@/lib/safeRedirect";
import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { fieldInvalid, fieldLabel } from "@/lib/form-styles";
import { verifyEmailAction, resendVerificationEmailAction } from "./actions";

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
      setError("Verified, but automatic login failed. Try logging in manually.");
      setSubmitting(false);
      return;
    }

    router.push(safeCallbackPath(callbackUrl));
    router.refresh();
  }

  async function handleResend() {
    setError(null);
    setResent(false);
    await resendVerificationEmailAction(email);
    setResent(true);
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
      <Link href="/register" className="tap w-fit mb-4 flex items-center gap-1.5 text-small text-slate-500 transition hover:text-slate-300">
        <ArrowLeftIcon size={16} />
        Back
      </Link>
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
            New code sent.
          </p>
        )}

        <Button type="submit" disabled={code.length !== 6} loading={submitting} className="cta-sheen w-full">
          {submitting ? "Verifying…" : "Verify"}
        </Button>
      </form>

      <button
        type="button"
        onClick={handleResend}
        className="mt-4 w-full text-center text-small text-slate-500 transition hover:text-[rgb(var(--c-s-50))]"
      >
        Didn&apos;t get a code? Resend
      </button>
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

"use client";

import { TurnstileWidget } from "@/components/security/TurnstileWidget";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { CheckIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { fieldInvalid, fieldLabel } from "@/lib/form-styles";
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
  const { status } = useSession();

  // Already signed in: nothing to create, go straight into the app.
  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
  }, [status, router]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Honeypot, see /api/auth/register. Real visitors never see or fill it.
  const [website, setWebsite] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);
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
      body: JSON.stringify({ name, email, password, website, turnstileToken }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Something went wrong creating your account.");
      setCaptchaReset((n) => n + 1);
      setSubmitting(false);
      return;
    }

    // Account exists but isn't usable yet, a verification code was just
    // emailed. Signing in happens at the end of that flow, not here.
    const params = new URLSearchParams({ email, callbackUrl });
    router.push(`/verify-email?${params}`);
  }

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className="w-full glass-surface-elevated p-7"
    >
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-slate-300 bg-neu-base shadow-raised-low">
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
      <h1 className="font-hero text-hero font-bold text-balance text-center text-slate-50">Create your account</h1>

      <motion.form onSubmit={handleSubmit} animate={shakeControls} className="mt-6 space-y-4">
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="reg-hp">Leave this empty</label>
        <input id="reg-hp" name="hp_company" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
        <div>
          <Label htmlFor="name" className={fieldLabel}>
            Name
          </Label>
          <Input
            id="name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="email" className={fieldLabel}>
            Email
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="password" className={fieldLabel}>
            Password
          </Label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            aria-invalid={Boolean(error)}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            className={cn(error && fieldInvalid)}
          />
          {/* Live, not just a submit-time rejection: the length rule is the
              one real requirement this form has, so it's shown as it's
              being met instead of only as a reason the submit just failed. */}
          {password.length > 0 && (
            <p className={`mt-1.5 flex items-center gap-1.5 text-small ${password.length >= MIN_PASSWORD_LENGTH ? "text-slate-50" : "text-slate-500"}`}>
              <CheckIcon size={11} className={password.length >= MIN_PASSWORD_LENGTH ? "opacity-100" : "opacity-30"} />
              At least {MIN_PASSWORD_LENGTH} characters
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="confirmPassword" className={fieldLabel}>
            Confirm password
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
            <p className={`mt-1.5 flex items-center gap-1.5 text-small ${password === confirmPassword ? "text-slate-50" : "text-slate-500"}`}>
              <CheckIcon size={11} className={password === confirmPassword ? "opacity-100" : "opacity-30"} />
              {password === confirmPassword ? "Passwords match" : "Passwords don't match yet"}
            </p>
          )}
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 text-small text-slate-400">
          <input
            type="checkbox"
            checked={agreedToTerms}
            onChange={(e) => {
              setAgreedToTerms(e.target.checked);
              setError(null);
            }}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-ink/10 bg-slate-950 accent-[rgb(var(--c-s-50))]"
          />
          <span>
            I agree to the{" "}
            <Link href="/terms" target="_blank" className="text-[rgb(var(--c-s-50))] underline transition hover:opacity-70">
              Terms &amp; refund policy
            </Link>{" "}
            and{" "}
            <Link href="/privacy" target="_blank" className="text-[rgb(var(--c-s-50))] underline transition hover:opacity-70">
              Privacy policy
            </Link>
            .
          </span>
        </label>

        <TurnstileWidget action="signup" onToken={setTurnstileToken} resetKey={captchaReset} />

        {error && (
          <p role="alert" className="text-small text-red-400">
            {error}
          </p>
        )}

        <Button type="submit" loading={submitting} className="cta-sheen w-full">
          {submitting ? "Creating account…" : "Create account"}
        </Button>
      </motion.form>

      <p className="mt-6 text-center text-small text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="text-[rgb(var(--c-s-50))] transition hover:opacity-70">
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

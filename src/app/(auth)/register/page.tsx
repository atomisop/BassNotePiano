"use client";

import { MIN_PASSWORD_LENGTH, passwordRequirementError } from "@/lib/passwordRules";
import { PasswordStrength } from "@/components/ui/password-strength";
import { TurnstileWidget } from "@/components/security/TurnstileWidget";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { CheckIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { fieldInvalid, fieldLabel } from "@/lib/form-styles";
import { useErrorShake } from "@/lib/useErrorShake";
import { FULL_NAME_MESSAGE, hasFirstAndLastName } from "@/lib/studentName";
import { normalizePhone, PHONE_HELP, signupPhoneError, signupPhoneNote } from "@/lib/phone";
import { UserPlus } from "@/components/ui/appIcons";

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", bounce: 0, duration: 0.4 } },
};


function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const { data: session, status } = useSession();

  // Already signed in: nothing to create, go straight into the app.
  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) return;
    let cancelled = false;
    // Only a session the server still accepts counts (see the login page).
    fetch("/api/me/status", { cache: "no-store" })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) router.replace("/dashboard");
        else void signOut({ redirect: false });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [status, session, router]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  // A child or sibling who has no number of their own can skip it (one number belongs to one account, so a shared family number cannot be used).
  const [noPhone, setNoPhone] = useState(false);
  // Whether this sign-up asks for a phone number (it does whenever texts can be sent).
  const [phoneRequired, setPhoneRequired] = useState(false);
  // Whether a text code is really sent. The words under the phone box depend on it.
  const [verifyBySms, setVerifyBySms] = useState(false);
  useEffect(() => {
    fetch("/api/auth/signup-options")
      .then((r) => r.json())
      .then((o) => {
        setPhoneRequired(Boolean(o?.phoneRequired));
        setVerifyBySms(Boolean(o?.verifyBySms));
      })
      .catch(() => undefined);
  }, []);
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

    if (!hasFirstAndLastName(name)) {
      setError(FULL_NAME_MESSAGE);
      return;
    }
    if (phoneRequired && !noPhone && !normalizePhone(phone)) {
      setError(signupPhoneError(verifyBySms));
      return;
    }
    const passwordError = passwordRequirementError(password);
    if (passwordError) {
      setError(passwordError);
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
      body: JSON.stringify({ name, email, phone: noPhone ? "" : phone, noPhone, password, website, turnstileToken, ref: searchParams.get("ref") }),
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
    const created = await res.json().catch(() => null);
    const params = new URLSearchParams({ email, callbackUrl });
    if (created?.emailSent === false) params.set("sendFailed", "1");
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
        <UserPlus className="h-6 w-6" />
      </div>
      <h1 className="font-hero text-hero font-bold text-balance text-center text-slate-50">Create your account</h1>
      {/^[A-Za-z0-9]{8}$/.test(searchParams.get("ref") ?? "") && (
        <p className="mt-3 text-center text-small text-slate-300">A friend invited you. Start a 84 or 168 day plan and you both get 10% off for 3 months.</p>
      )}

      <motion.form onSubmit={handleSubmit} animate={shakeControls} className="mt-6 space-y-4">
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="reg-hp">Leave this empty</label>
        <input id="reg-hp" name="hp_company" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
        <div>
          <Label htmlFor="name" className={fieldLabel}>
            Full name
          </Label>
          <Input
            id="name"
            type="text"
            autoComplete="name"
            placeholder="First and last name"
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
        {phoneRequired && (
          <div>
            <Label htmlFor="phone" className={fieldLabel}>
              Phone number
            </Label>
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(555) 123-4567"
              required={!noPhone}
              disabled={noPhone}
              value={noPhone ? "" : phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <p className="mt-1.5 text-small text-slate-500">{signupPhoneNote(verifyBySms)} {PHONE_HELP}</p>
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-small text-slate-400">
              <input type="checkbox" checked={noPhone} onChange={(e) => setNoPhone(e.target.checked)} className="h-4 w-4 cursor-pointer accent-slate-50" />
              I do not have my own phone number
            </label>
          </div>
        )}
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
          {/* Live while typing: the strength bars and the requirements, from the same rules the server enforces. */}
          {password.length > 0 && <PasswordStrength value={password} className="mt-3" />}
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
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-ink/10 bg-slate-950 accent-slate-50"
          />
          <span>
            I agree to the{" "}
            <Link href="/terms" target="_blank" className="text-slate-50 underline transition hover:opacity-70">
              Terms &amp; refund policy
            </Link>{" "}
            and{" "}
            <Link href="/privacy" target="_blank" className="text-slate-50 underline transition hover:opacity-70">
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
        <Link href="/login" className="text-slate-50 underline underline-offset-4 transition hover:opacity-70">
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

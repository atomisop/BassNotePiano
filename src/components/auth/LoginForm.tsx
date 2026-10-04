"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { fieldInvalid, fieldLabel } from "@/lib/form-styles";
import { useErrorShake } from "@/lib/useErrorShake";
import { loginStepOneAction } from "@/app/(auth)/login/actions";

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
  const shakeControls = useErrorShake(error);

  async function handleSubmit(e: FormEvent) {
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
      onNavigateAway?.();
      router.push(`/verify-email?${params}`);
      return;
    }

    const signInResult = await signIn("credentials", { email, code: result.autoCode, redirect: false });
    if (signInResult?.error) {
      setError("Something went wrong logging in. Try again.");
      setSubmitting(false);
      return;
    }

    if (embedded) {
      onSuccess?.();
      router.refresh();
      return;
    }
    router.push(callbackUrl);
    router.refresh();
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
            autoFocus
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
              className="tap inline-flex items-center text-small text-slate-500 transition hover:text-[rgb(var(--c-s-50))]"
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

        {error && (
          <p role="alert" className="text-small text-red-400">
            {error}
          </p>
        )}

        <Button type="submit" loading={submitting} className="cta-sheen w-full">
          {submitting ? "Logging in…" : "Log in"}
        </Button>
      </motion.form>

      <p className="mt-6 text-center text-small text-slate-500">
        New here?{" "}
        <Link href="/register" onClick={onNavigateAway} className="text-[rgb(var(--c-s-50))] transition hover:opacity-70">
          Create an account
        </Link>
      </p>
    </>
  );
}

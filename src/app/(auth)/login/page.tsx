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
import { cn } from "@/lib/utils";
import { fieldInvalid, fieldLabel } from "@/lib/form-styles";
import { useErrorShake } from "@/lib/useErrorShake";
import { loginStepOneAction } from "./actions";

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", bounce: 0, duration: 0.4 } },
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

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
      router.push(`/verify-email?${params}`);
      return;
    }

    const signInResult = await signIn("credentials", { email, code: result.autoCode, redirect: false });
    if (signInResult?.error) {
      setError("Something went wrong logging in. Try again.");
      setSubmitting(false);
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className="w-full glass-surface-elevated p-7"
    >
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Welcome back</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Log in to continue</h1>
      <p className="mt-1.5 text-small text-slate-500">Pick up your roadmap right where you left it.</p>

      <motion.form onSubmit={handleSubmit} animate={shakeControls} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="email" className={fieldLabel}>
            Email
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
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
            <Label htmlFor="password" className={fieldLabel}>
              Password
            </Label>
            <Link href="/forgot-password" className="text-small text-slate-500 transition hover:text-[rgb(var(--c-s-50))]">
              Forgot?
            </Link>
          </div>
          <PasswordInput
            id="password"
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
          {submitting ? "Logging in…" : "Continue"}
        </Button>
      </motion.form>

      <p className="mt-6 text-center text-small text-slate-500">
        New here?{" "}
        <Link href="/register" className="text-[rgb(var(--c-s-50))] transition hover:opacity-70">
          Create an account
        </Link>
      </p>
    </motion.div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

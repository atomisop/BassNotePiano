"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fieldLabel } from "@/lib/form-styles";
import { requestPasswordResetAction } from "./actions";

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", bounce: 0, duration: 0.4 } },
};

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await requestPasswordResetAction(email);
    router.push(`/reset-password?email=${encodeURIComponent(email)}`);
  }

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className="w-full glass-surface-elevated p-7"
    >
      <p className="text-small font-medium uppercase tracking-[0.2em] text-slate-50/80">Reset password</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Forgot your password?</h1>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <Button type="submit" loading={submitting} className="cta-sheen w-full">
          {submitting ? "Sending…" : "Send code"}
        </Button>
      </form>

      <p className="mt-6 text-center text-small text-slate-500">
        Remembered it?{" "}
        <Link href="/login" className="text-slate-50 underline underline-offset-4 transition hover:opacity-70">
          Back to login
        </Link>
      </p>
    </motion.div>
  );
}

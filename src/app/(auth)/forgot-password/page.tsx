"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { requestPasswordResetAction } from "./actions";

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 260, damping: 26 } },
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
      className="w-full max-w-sm glass-surface-elevated p-7"
    >
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Reset password</p>
      <h1 className="mt-1.5 font-serif text-2xl text-slate-50">Forgot your password?</h1>
      <p className="mt-2 text-sm text-slate-500">
        Enter your account email and we&apos;ll send a 6-digit code to reset it.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-xs font-medium text-slate-400">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-ink/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-amber-400/60"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="cta-sheen w-full rounded-xl bg-amber-400 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Sending…" : "Send code"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        Remembered it?{" "}
        <Link href="/login" className="text-amber-300 transition hover:text-amber-200">
          Back to login
        </Link>
      </p>
    </motion.div>
  );
}

"use client";

import { AlertCircle, Check } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { MorphingSquare } from "@/components/ui/morphing-square";
import type { MemberCheck } from "@/lib/familyMemberCheck";

export type CheckState = MemberCheck | "checking" | "limited" | "duplicate" | "failed";

const PROBLEM: Record<Exclude<CheckState, "ready" | "checking">, string> = {
  invalid: "That does not look like an email yet",
  no_account: "No account with this email. They need to register first",
  needs_name: "This account needs a first and last name before it can join",
  self: "That is your own account. You are already included",
  duplicate: "Already added above",
  limited: "Too many checks. Wait a little and try again",
  failed: "Could not check just now. Try again in a moment",
};

/** The line under one email box: a small square loader while the account is looked up, then a green check, or why not. Takes no room until there is something to say. */
export function AccountCheckLine({ state }: { state: CheckState | null }) {
  const reduced = useReducedMotion();
  if (!state) return null;
  return (
    <p className="mt-1.5 flex min-h-5 items-center gap-2 pl-1 text-small" role="status" aria-live="polite">
      {state === "checking" ? (
        <>
          <MorphingSquare size={12} className="shrink-0" />
          <span className="text-slate-400">Checking the account…</span>
        </>
      ) : state === "ready" ? (
        <>
          <motion.span
            initial={reduced ? false : { scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 520, damping: 22 }}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500"
          >
            <Check aria-hidden className="h-3 w-3 text-white" strokeWidth={3.5} />
          </motion.span>
          <span className="text-emerald-400">Account found. Ready to join</span>
        </>
      ) : (
        <>
          <AlertCircle aria-hidden className="h-4 w-4 shrink-0 text-amber-300" />
          <span className="text-amber-300">{PROBLEM[state]}</span>
        </>
      )}
    </p>
  );
}

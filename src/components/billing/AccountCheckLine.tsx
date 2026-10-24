"use client";

import { AlertCircle, Check } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { MorphingSquare } from "@/components/ui/morphing-square";
import type { MemberCheck } from "@/lib/familyMemberCheck";

/** "ready" is an account that exists; the rest of the states follow the invitation sent to it. */
export type CheckState = MemberCheck | "checking" | "limited" | "duplicate" | "failed" | "sending" | "waiting" | "accepted" | "declined";

const PROBLEM: Record<Exclude<CheckState, "ready" | "checking" | "sending" | "waiting" | "accepted">, string> = {
  invalid: "That does not look like an email yet",
  no_account: "No account with this email. They need to register first",
  needs_name: "This account needs a first and last name before it can join",
  self: "That is your own account. You are already included",
  duplicate: "Already added above",
  declined: "They declined the invitation. Remove them to continue",
  limited: "Too many checks. Wait a little and try again",
  failed: "Could not check just now. Try again in a moment",
};

/** The line under one email box: a small square loader while the account is looked up, then a green check, or why not. Takes no room until there is something to say. */
export function AccountCheckLine({ state }: { state: CheckState | null }) {
  const reduced = useReducedMotion();
  if (!state) return null;
  return (
    <p className="mt-1.5 flex min-h-5 items-center gap-2 pl-1 text-small" role="status" aria-live="polite">
      {state === "checking" || state === "sending" || state === "waiting" ? (
        <>
          <MorphingSquare size={12} className="shrink-0" />
          <span className="text-slate-400">
            {state === "checking" ? "Checking the account…" : state === "sending" ? "Sending the invitation…" : "Invitation sent. Waiting for them to accept"}
          </span>
        </>
      ) : state === "ready" || state === "accepted" ? (
        <>
          <motion.span
            initial={reduced ? false : { scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 520, damping: 22 }}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500"
          >
            <Check aria-hidden className="h-3 w-3 text-white" strokeWidth={3.5} />
          </motion.span>
          <span className="text-emerald-400">{state === "accepted" ? "Accepted. Ready to join" : "Account found. Send the invitation below"}</span>
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

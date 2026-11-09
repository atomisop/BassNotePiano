"use client";

import { useState } from "react";
import { Check, UserPlus } from "@/components/ui/appIcons";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { toast } from "@/components/ui/Toaster";
import { askToBookTogetherAction } from "@/app/(dashboard)/ask-together-actions";

/**
 * Next to an email that is not a friend yet on the family class form: sends them a friend request in place (or, with no account, the
 * invitation to make one), worded the same either way. They accept from the bell; once they do, the booking can go ahead as usual.
 */
export function AskTogetherButton({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  async function ask() {
    if (state !== "idle") return;
    setState("sending");
    const result = await askToBookTogetherAction(email).catch(() => ({ ok: false as const, error: "Could not send. Try again." }));
    if (result.ok) {
      setState("sent");
      toast.success(result.message);
    } else {
      setState("idle");
      toast.warning(result.error);
    }
  }

  if (state === "sent") {
    return (
      <span className="inline-flex h-7 items-center gap-1 rounded-full bg-slate-800 px-2.5 text-small font-medium text-slate-300">
        <Check aria-hidden className="h-3.5 w-3.5" />
        Asked
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void ask()}
      aria-busy={state === "sending"}
      className="tap inline-flex h-7 items-center gap-1 rounded-full bg-neu-base px-2.5 text-small font-medium text-slate-100 shadow-raised-low transition hover:text-slate-50 active:shadow-pressed-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {state === "sending" ? <MorphingSquare size={12} className="shrink-0" /> : <UserPlus aria-hidden className="h-3.5 w-3.5" />}
      Ask to book together
    </button>
  );
}

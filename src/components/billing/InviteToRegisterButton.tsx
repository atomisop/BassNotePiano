"use client";

import { useState } from "react";
import { Check, Send } from "lucide-react";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { toast } from "@/components/ui/Toaster";
import { inviteToRegisterAction } from "@/app/(dashboard)/invite-actions";

/** A small "Invite" next to an email with no account: emails them an invitation to create one. Turns into "Invited" once sent. */
export function InviteToRegisterButton({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  async function send() {
    if (state !== "idle") return;
    setState("sending");
    const result = await inviteToRegisterAction(email).catch(() => ({ ok: false, result: null, error: "Could not send. Try again." }));
    if (result.ok) {
      setState("sent");
      toast.success(result.result === "recent" ? "They were already invited" : "Invitation sent");
    } else {
      setState("idle");
      toast.warning(result.error ?? "Could not send");
    }
  }

  if (state === "sent") {
    return (
      <span className="inline-flex h-7 items-center gap-1 rounded-full bg-slate-800 px-2.5 text-small font-medium text-slate-300">
        <Check aria-hidden className="h-3.5 w-3.5" />
        Invited
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void send()}
      aria-busy={state === "sending"}
      className="tap inline-flex h-7 items-center gap-1 rounded-full bg-neu-base px-2.5 text-small font-medium text-slate-100 shadow-raised-low transition hover:text-slate-50 active:shadow-pressed-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {state === "sending" ? <MorphingSquare size={12} className="shrink-0" /> : <Send aria-hidden className="h-3.5 w-3.5" />}
      Invite
    </button>
  );
}

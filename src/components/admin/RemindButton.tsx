"use client";

import { useState } from "react";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { sendFollowUpReminderAction } from "@/app/(dashboard)/admin/followup-actions";

/** "Remind": the first tap asks, the second sends the fixed reminder for this reason to this person. */
export function RemindButton({ kind, userId, name }: { kind: string; userId: string; name: string }) {
  const [state, setState] = useState<"idle" | "asking" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setState("sending");
    setError(null);
    try {
      const res = await sendFollowUpReminderAction(kind, userId);
      if (res.ok) setState("sent");
      else {
        setError(res.error);
        setState("idle");
      }
    } catch {
      setError("That did not go through. Please try again.");
      setState("idle");
    }
  }

  if (state === "sent") return <span className="text-small text-slate-400">Reminder sent</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {state === "asking" || state === "sending" ? (
        <>
          <span className="text-small text-slate-300">Send {name} a reminder?</span>
          <button type="button" disabled={state === "sending"} onClick={() => setState("idle")} className="tap text-small text-slate-400 hover:text-slate-200">
            Not yet
          </button>
          <button type="button" disabled={state === "sending"} onClick={() => void send()} className="tap inline-flex items-center gap-1 text-small font-semibold text-signal">
            {state === "sending" && <MorphingSquare size={11} />}
            {state === "sending" ? "Sending…" : "Yes, send"}
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setState("asking")} className="tap rounded-full bg-neu-base px-2.5 py-0.5 text-small font-medium text-slate-300 shadow-raised-low hover:text-slate-50">
          Remind
        </button>
      )}
      {error && <span role="alert" className="text-small text-red-400">{error}</span>}
    </span>
  );
}

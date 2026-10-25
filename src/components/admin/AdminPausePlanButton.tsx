"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { buttonVariants } from "@/components/ui/button";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { toast } from "@/components/ui/Toaster";
import { pausePlanAdminAction, resumePlanAdminAction } from "@/app/(dashboard)/admin/payment-plans/actions";

export interface PlanPauseState {
  /** The pause is running now. */
  paused: boolean;
  /** ISO end date of a pause that has one; null for an indefinite pause. */
  until: string | null;
}

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

/**
 * Next to a plan's Active badge. Running plan: Pause opens a small box that asks until when, with the date and the Pause button, and
 * beside them Indefinitely. Paused plan: the badge says until when (or indefinitely) and Resume ends it now.
 */
export function AdminPausePlanButton({ planId, state, compact = false }: { planId: string; state: PlanPauseState; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(tomorrow());
  const [busy, setBusy] = useState<"date" | "indefinite" | "resume" | null>(null);

  async function run(kind: "date" | "indefinite" | "resume") {
    setBusy(kind);
    const result = await (kind === "resume" ? resumePlanAdminAction(planId) : pausePlanAdminAction(planId, kind === "date" ? { kind: "until", date } : { kind: "indefinite" })).catch(() => ({
      ok: false,
      error: "Something went wrong. Try again.",
    }));
    setBusy(null);
    if (!result.ok) {
      toast.warning(result.error ?? "Could not do that.");
      return;
    }
    toast.success(kind === "resume" ? "Plan resumed" : "Plan paused");
    setOpen(false);
    router.refresh();
  }

  const button = buttonVariants({ variant: "secondary", size: "sm", className: compact ? "h-8 px-2.5" : "" });

  if (state.paused) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-2.5 py-1 text-small font-medium uppercase tracking-wide text-amber-300">
          <Pause aria-hidden className="h-3 w-3" />
          {state.until ? `Paused until ${new Date(state.until).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "Paused indefinitely"}
        </span>
        <button type="button" onClick={() => void run("resume")} aria-busy={busy === "resume"} className={button}>
          {busy === "resume" ? <MorphingSquare size={12} className="mr-1.5 shrink-0" /> : <Play aria-hidden className="mr-1.5 h-3.5 w-3.5" />}
          Resume
        </button>
      </span>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={button}>
        <Pause aria-hidden className="mr-1.5 h-3.5 w-3.5" />
        Pause
      </button>
      <Dialog open={open} onOpenChange={(next) => busy === null && setOpen(next)} title="Pause until when?">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={date}
            min={tomorrow()}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Pause until"
            className="h-11 min-w-0 flex-1 rounded-control bg-neu-base px-4 text-body text-slate-100 shadow-pressed-low outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button type="button" disabled={!date || busy !== null} onClick={() => void run("date")} aria-busy={busy === "date"} className={buttonVariants({ variant: "primary" })}>
            {busy === "date" && <MorphingSquare size={14} className="mr-2 shrink-0" />}
            Pause
          </button>
          <button type="button" disabled={busy !== null} onClick={() => void run("indefinite")} aria-busy={busy === "indefinite"} className={buttonVariants({ variant: "secondary" })}>
            {busy === "indefinite" && <MorphingSquare size={14} className="mr-2 shrink-0" />}
            Indefinitely
          </button>
        </div>
      </Dialog>
    </>
  );
}

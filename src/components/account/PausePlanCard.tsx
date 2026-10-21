"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { announceChange } from "@/lib/liveEvents";
import { PAUSE_COOLDOWN_DAYS, PAUSE_MAX_WEEKS } from "@/lib/planPause";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/New_York" });

/** Pause a running plan for 1 to 4 weeks: the weekly time stays reserved and the next payment moves back by the same time. */
export function PausePlanCard({
  pausedAt,
  pausedUntil,
  onPause,
}: {
  pausedAt: string | null;
  pausedUntil: string | null;
  onPause: (weeks: number) => Promise<{ ok: boolean; error: string | null; resumesOn: string | null }>;
}) {
  const router = useRouter();
  const [weeks, setWeeks] = useState(2);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (pausedUntil) {
    return (
      <p className="text-small text-slate-300" role="status">
        Your plan is paused. Classes start again on <strong className="text-slate-50">{day(pausedUntil)}</strong>, and your weekly time is still yours.
      </p>
    );
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    const result = await onPause(weeks);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong. Try again.");
      setConfirming(false);
      return;
    }
    setConfirming(false);
    announceChange("status", "page");
    router.refresh();
  }

  return (
    <div>
      <p className="text-small text-slate-400">
        Going away? Pause for 1 to {PAUSE_MAX_WEEKS} weeks. Your weekly time stays reserved, your next payment moves back by the same time, and your unused credits
        last that much longer. One pause every {PAUSE_COOLDOWN_DAYS} days.
        {pausedAt ? ` Your last pause started ${day(pausedAt)}.` : ""}
      </p>
      {!confirming ? (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="pause-weeks" className="text-small font-medium text-slate-200">For how long</label>
            <select
              id="pause-weeks"
              value={weeks}
              onChange={(e) => setWeeks(Number(e.target.value))}
              className="mt-1 block h-11 rounded-lg bg-neu-base px-3 text-base text-slate-100 shadow-pressed-low outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {Array.from({ length: PAUSE_MAX_WEEKS }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n} week{n === 1 ? "" : "s"}</option>
              ))}
            </select>
          </div>
          <button type="button" onClick={() => setConfirming(true)} className={buttonVariants({ variant: "secondary", size: "sm" })}>Pause my plan</button>
        </div>
      ) : (
        <div className="mt-3 rounded-xl bg-neu-base p-4 shadow-raised-low">
          <p className="text-small text-slate-200">
            Pause for {weeks} week{weeks === 1 ? "" : "s"}, starting now? Classes in that time are canceled and come back on their own afterwards.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={confirm} className={buttonVariants({ variant: "primary", size: "sm", className: "text-black" })}>
              {busy ? "Pausing..." : "Yes, pause"}
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)} className={buttonVariants({ variant: "secondary", size: "sm" })}>Not now</button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-small text-red-400" role="alert">{error}</p>}
    </div>
  );
}

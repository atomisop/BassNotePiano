"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pause, Play, RefreshCw } from "lucide-react";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toaster";
import { setJobPausedAction } from "@/app/(dashboard)/admin/jobActions";

export interface TaskRow {
  name: string;
  state: "ok" | "waiting" | "failed" | "late" | "never" | "paused";
  lastRanAt: string | null;
  note: string | null;
}

const stopped = (s: TaskRow["state"]) => s === "failed" || s === "late" || s === "never";
const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * The automatic tasks: one row each with its last run, a Pause / Resume button per task (owner only, two taps to pause), and a
 * Refresh that runs down the list: each row shows a shimmer, then a spinner while it is being looked at, then a check, and
 * finally its fresh result.
 */
export function AutomaticTasks({ jobs, checkedAt, canPause }: { jobs: TaskRow[]; checkedAt: string; canPause: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [checking, setChecking] = useState(false);
  const [idx, setIdx] = useState(0);
  const [sure, setSure] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pausedNow, setPausedNow] = useState<Record<string, boolean>>({});
  const timer = useRef<number | undefined>(undefined);

  // The run-down: step through the rows a beat apart, and finish once the fresh data has arrived too.
  useEffect(() => {
    if (!checking) return;
    timer.current = window.setInterval(() => setIdx((i) => (i < jobs.length ? i + 1 : i)), 140);
    return () => window.clearInterval(timer.current);
  }, [checking, jobs.length]);
  useEffect(() => {
    if (checking && idx >= jobs.length && !pending) {
      const t = window.setTimeout(() => setChecking(false), 260);
      return () => window.clearTimeout(t);
    }
  }, [checking, idx, jobs.length, pending]);

  function refresh() {
    if (checking) return;
    setIdx(0);
    setChecking(true);
    start(() => router.refresh());
  }

  async function toggle(job: TaskRow, isPaused: boolean) {
    if (!isPaused && sure !== job.name) {
      setSure(job.name);
      window.setTimeout(() => setSure((s) => (s === job.name ? null : s)), 3000);
      return;
    }
    setSure(null);
    setBusy(job.name);
    const next = !isPaused;
    setPausedNow((p) => ({ ...p, [job.name]: next }));
    const result = await setJobPausedAction(job.name, next).catch(() => ({ ok: false, error: "Something went wrong." }));
    setBusy(null);
    if (!result.ok) {
      setPausedNow((p) => {
        const copy = { ...p };
        delete copy[job.name];
        return copy;
      });
      return void toast.warning(result.error ?? "Could not change it.");
    }
    toast.success(next ? `${job.name} paused` : `${job.name} resumed`);
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-small text-slate-500">Checked {checkedAt} ET</p>
        <button
          type="button"
          onClick={refresh}
          disabled={checking}
          aria-busy={checking}
          className="tap inline-flex min-h-9 items-center gap-2 rounded-lg bg-neu-base px-3 text-small font-medium text-slate-200 shadow-raised-low transition hover:text-slate-50 active:shadow-pressed-low disabled:opacity-70"
        >
          <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} aria-hidden />
          {checking ? "Checking…" : "Refresh"}
        </button>
      </div>
      <ul className="mt-3 divide-y divide-slate-50/10">
        {jobs.map((job, i) => {
          const isPaused = pausedNow[job.name] ?? job.state === "paused";
          const bad = stopped(job.state) && !isPaused;
          const when = job.lastRanAt ? fmt(job.lastRanAt) : null;
          const text = isPaused ? "paused" : job.state === "never" ? "has never run" : job.state === "failed" ? `failed, ${when}` : job.state === "late" ? `late, last ran ${when}` : when ?? "not run yet";
          const phase = !checking ? "done" : i < idx ? "checked" : i === idx ? "looking" : "waiting";
          return (
            <li key={job.name} className="py-2 text-small">
              <div className="flex items-center justify-between gap-3">
                <span className={isPaused ? "text-slate-500" : "text-slate-200"}>{job.name}</span>
                <span className="flex items-center gap-2">
                  {phase === "waiting" && <Skeleton className="h-4 w-24" />}
                  {phase === "looking" && (
                    <span className="inline-flex items-center gap-1.5 text-slate-400">
                      <MorphingSquare size={12} />
                      checking
                    </span>
                  )}
                  {phase === "checked" && (
                    <span className="inline-flex items-center gap-1 text-emerald-300">
                      <Check aria-hidden className="h-3.5 w-3.5" />
                      checked
                    </span>
                  )}
                  {phase === "done" && <span className={isPaused ? "text-amber-300" : bad ? "text-red-300" : "text-slate-500"}>{text}</span>}
                  {canPause && (
                    <button
                      type="button"
                      onClick={() => void toggle(job, isPaused)}
                      disabled={busy === job.name || checking}
                      aria-label={isPaused ? `Resume ${job.name}` : sure === job.name ? `Tap again to pause ${job.name}` : `Pause ${job.name}`}
                      title={isPaused ? "Resume this task" : sure === job.name ? "Tap again to pause" : "Pause this task"}
                      className={`tap inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-lg px-2 text-small font-medium shadow-raised-low transition active:shadow-pressed-low disabled:opacity-50 ${
                        isPaused ? "bg-signal/16 text-signal-fg" : sure === job.name ? "bg-red-500/90 text-white" : "bg-neu-base text-slate-300 hover:text-slate-50"
                      }`}
                    >
                      {isPaused ? <Play aria-hidden className="h-3.5 w-3.5" /> : <Pause aria-hidden className="h-3.5 w-3.5" />}
                      {sure === job.name && !isPaused && "Sure?"}
                    </button>
                  )}
                </span>
              </div>
              {phase === "done" && job.state === "failed" && job.note && !isPaused && <p className="mt-1 break-words text-red-300/80">{job.note}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

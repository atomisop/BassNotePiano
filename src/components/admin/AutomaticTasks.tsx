"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pause, Play, RefreshCw, RotateCw } from "@/components/ui/appIcons";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { toast } from "@/components/ui/Toaster";
import { checkJobsAction, runJobNowAction, setJobPausedAction } from "@/app/(dashboard)/admin/jobActions";

export interface TaskRow {
  name: string;
  state: "ok" | "waiting" | "failed" | "late" | "never" | "paused";
  lastRanAt: string | null;
  note: string | null;
}

const stopped = (s: TaskRow["state"]) => s === "failed" || s === "late" || s === "never";
const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

interface Fresh {
  verdict: { ok: boolean; summary: string; problems: string[] };
  row: Pick<TaskRow, "state" | "lastRanAt" | "note">;
}

/**
 * The automatic tasks: one row each with its last run, a Pause / Resume button per task (owner only, two taps to pause), and a
 * Refresh that checks, live and without running anything, that each task COULD work right now: the database tables, email, Discord,
 * backup storage, mail chain and outside monitor it depends on are each tested (src/lib/jobCheckNow.ts), and every row shows what
 * answered or what is broken, next to its last real run (which a check never changes). The rows fill in one after another.
 * Run now (owner only) starts the task's real run at once instead of waiting for its next turn; a stopped task shows it in orange.
 */
export function AutomaticTasks({ jobs, checkedAt, canPause }: { jobs: TaskRow[]; checkedAt: string; canPause: boolean }) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [fresh, setFresh] = useState<Record<string, Fresh>>({});
  const [checkedNow, setCheckedNow] = useState<string | null>(null);
  const [sure, setSure] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pausedNow, setPausedNow] = useState<Record<string, boolean>>({});
  const [running, setRunning] = useState<string | null>(null);

  async function refresh() {
    if (checking) return;
    setFresh({});
    setChecking(true);
    const res = await checkJobsAction().catch(() => null);
    if (!res?.ok || !res.jobs) {
      setChecking(false);
      return void toast.warning(res?.error ?? "Could not reach the server to check the tasks.");
    }
    // The results are all real and arrive together; showing them row by row only makes them easy to follow.
    for (const job of jobs) {
      const got = res.jobs[job.name];
      if (!got) continue;
      setFresh((f) => ({ ...f, [job.name]: { verdict: got.verdict, row: { state: got.state, lastRanAt: got.lastRanAt, note: got.note } } }));
      await new Promise((r) => window.setTimeout(r, 90));
    }
    setChecking(false);
    setCheckedNow(new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", second: "2-digit" }));
    router.refresh();
    const broken = Object.values(res.jobs).filter((j) => !j.verdict.ok).length;
    if (broken > 0) toast.warning(`${broken} task${broken === 1 ? " can't" : "s can't"} work right now. The reason is under ${broken === 1 ? "it" : "each"}.`);
    else toast.success("Everything the tasks need is working.");
  }

  // Run now: the same run the schedule starts, recorded like one. One task at a time from this screen.
  async function runNow(job: TaskRow) {
    if (running) return;
    setRunning(job.name);
    const res = await runJobNowAction(job.name).catch(() => ({ ok: false, outcome: null, error: "Could not reach the server to run it." }));
    setRunning(null);
    // Its fresh check result (if any) described the old state; the page's own row is read again below.
    setFresh((f) => {
      const copy = { ...f };
      delete copy[job.name];
      return copy;
    });
    router.refresh();
    if (!res.ok) return void toast.warning(res.error ?? "It could not run.");
    toast.success(res.outcome === "done" ? `${job.name} ran.` : `${job.name} is still running. Its row updates when it ends.`);
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
        <p className="text-small text-slate-500">Checked {checkedNow ?? checkedAt} ET</p>
        <button
          type="button"
          onClick={refresh}
          disabled={checking}
          aria-busy={checking}
          className="tap inline-flex min-h-9 items-center gap-2 rounded-full bg-neu-base px-3 text-small font-medium text-slate-200 shadow-raised-low transition hover:text-slate-50 active:shadow-pressed-low disabled:opacity-70"
        >
          <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} aria-hidden />
          {checking ? "Checking…" : "Check now"}
        </button>
      </div>
      <ul className="mt-3 divide-y divide-slate-50/10">
        {jobs.map((listed) => {
          let job = listed;
          const got = fresh[job.name];
          if (got?.row) job = { ...job, ...got.row };
          const isPaused = pausedNow[job.name] ?? job.state === "paused";
          const bad = stopped(job.state) && !isPaused;
          const when = job.lastRanAt ? fmt(job.lastRanAt) : null;
          const text = isPaused ? "paused" : job.state === "never" ? "has never run" : job.state === "failed" ? `failed, ${when}` : job.state === "late" ? `late, last ran ${when}` : when ?? "not run yet";
          const phase = got ? "done" : checking ? "looking" : "done";
          return (
            <li key={job.name} className="py-2 text-small">
              <div className="flex items-center justify-between gap-3">
                <span className={`min-w-0 break-words ${isPaused ? "text-slate-500" : "text-slate-200"}`}>{job.name}</span>
                <span className="flex flex-wrap items-center justify-end gap-2">
                  {phase === "looking" && (
                    <span className="inline-flex items-center gap-1.5 text-slate-400">
                      <MorphingSquare size={12} />
                      checking
                    </span>
                  )}
                  {phase === "done" && <span className={isPaused ? "text-amber-300" : bad ? "text-red-300" : "text-slate-500"}>{text}</span>}
                  {canPause && !isPaused && (
                    <button
                      type="button"
                      onClick={() => void runNow(job)}
                      disabled={running !== null || checking || busy === job.name}
                      aria-busy={running === job.name}
                      aria-label={running === job.name ? `Running ${job.name}` : `Run ${job.name} now`}
                      title="Run this task now"
                      className={`tap inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-lg px-2 text-small font-medium shadow-raised-low transition active:shadow-pressed-low disabled:opacity-50 ${
                        bad ? "bg-signal/16 text-signal-fg" : "bg-neu-base text-slate-300 hover:text-slate-50"
                      }`}
                    >
                      {running === job.name ? <MorphingSquare size={12} /> : <RotateCw aria-hidden className="h-3.5 w-3.5" />}
                      {bad && running !== job.name && "Run now"}
                    </button>
                  )}
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
              {got && (
                <p className={`mt-1 flex items-start gap-1 break-words ${got.verdict.ok ? "text-emerald-300" : "text-red-300"}`}>
                  {got.verdict.ok && <Check aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                  <span>{got.verdict.ok ? got.verdict.summary : got.verdict.problems.join(" ")}</span>
                </p>
              )}
              {phase === "done" && job.state === "failed" && job.note && !isPaused && <p className="mt-1 break-words text-red-300/80">Last run: {job.note}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

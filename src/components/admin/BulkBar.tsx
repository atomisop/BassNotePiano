"use client";

import { useState, type ReactNode } from "react";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/Toaster";

export interface BulkAction {
  label: string;
  /** Asked before anything runs; leave out for a harmless action. */
  question?: string;
  confirmLabel?: string;
  /** Runs for each selected id, one after another. Throwing counts as a failure for that row only. */
  run: (id: string) => Promise<void>;
}

/**
 * The bar that appears while rows are ticked: how many, one button per bulk action (each with an "are you sure" when it changes
 * money or access), a progress line, and a plain report of anything that failed. Rows that worked are left out of the selection.
 */
export function BulkBar({
  ids,
  actions,
  onClear,
  onDone,
  extra,
}: {
  ids: string[];
  actions: BulkAction[];
  onClear: () => void;
  onDone: (succeeded: string[]) => void;
  extra?: ReactNode;
}) {
  const [asking, setAsking] = useState<BulkAction | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const busy = progress !== null;

  async function go(action: BulkAction) {
    setAsking(null);
    setErrors([]);
    const ok: string[] = [];
    const bad: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      setProgress(`${action.label}: ${i + 1} of ${ids.length}`);
      try {
        await action.run(ids[i]);
        ok.push(ids[i]);
      } catch (err) {
        bad.push(err instanceof Error ? err.message : "Did not go through.");
      }
    }
    setProgress(null);
    setErrors(bad);
    onDone(ok);
    const summary = `${ok.length} of ${ids.length} went through.`;
    if (bad.length === 0) toast.success(action.label, { description: summary });
    else if (ok.length === 0) toast.error(action.label, { description: "None of them went through. The reasons are in the bar above." });
    else toast.warning(action.label, { description: `${summary} The rest are listed in the bar above.` });
  }

  if (ids.length === 0 && errors.length === 0) return null;
  return (
    <div className="sticky top-0 z-20 -mx-1 mb-3 rounded-xl bg-neu-lift px-4 py-3 shadow-raised-mid">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-small font-semibold text-slate-50">{ids.length} selected</span>
        {asking ? (
          <>
            <span className="text-small text-slate-300">{asking.question}</span>
            <button type="button" onClick={() => setAsking(null)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Not yet
            </button>
            <button type="button" onClick={() => void go(asking)} className={buttonVariants({ variant: "primary", size: "sm" })}>
              {asking.confirmLabel ?? "Yes"}
            </button>
          </>
        ) : (
          <>
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                disabled={busy || ids.length === 0}
                onClick={() => (a.question ? setAsking(a) : void go(a))}
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                {a.label}
              </button>
            ))}
            {extra}
            <button type="button" disabled={busy} onClick={onClear} className="tap ml-auto text-small text-slate-400 hover:text-slate-200">
              Clear
            </button>
          </>
        )}
      </div>
      {progress && (
        <p role="status" className="mt-2 flex items-center gap-2 text-small text-slate-300">
          <MorphingSquare size={12} />
          {progress}
        </p>
      )}
      {errors.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-small text-red-400">
          {errors.slice(0, 5).map((e, i) => (
            <li key={i}>{e}</li>
          ))}
          {errors.length > 5 && <li>and {errors.length - 5} more</li>}
        </ul>
      )}
    </div>
  );
}

/** A tick box sized for touch. */
export function RowCheck({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <label className="tap flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} className="h-4 w-4 accent-signal" />
    </label>
  );
}

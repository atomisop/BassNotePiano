"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MorphingSquare } from "@/components/ui/morphing-square";

/** A button for a change that touches many rows at once: the first press asks, the second does it. */
export function BulkConfirmButton({
  label,
  question,
  confirmLabel,
  onConfirm,
}: {
  label: string;
  question: string;
  confirmLabel: string;
  onConfirm: () => Promise<{ message: string }>;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    setBusy(true);
    try {
      const { message } = await onConfirm();
      setResult({ ok: true, text: message });
      router.refresh();
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : "That didn't go through. Please try again." });
    } finally {
      setBusy(false);
      setAsking(false);
    }
  }

  if (asking) {
    return (
      <div className="rounded-xl bg-neu-base px-4 py-3 shadow-pressed-low">
        <p className="text-small text-slate-300">{question}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => setAsking(false)} disabled={busy} className="tap rounded-lg px-3 py-2 text-small font-medium text-slate-300 bg-neu-base shadow-raised-low active:shadow-pressed-low disabled:opacity-50">
            Not yet
          </button>
          <button type="button" onClick={run} disabled={busy} className="tap flex items-center gap-1.5 rounded-lg bg-[rgb(var(--c-a-400))] px-3 py-2 text-small font-semibold text-black shadow-raised-low disabled:opacity-50">
            {busy && <MorphingSquare size={12} />}
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button type="button" onClick={() => { setResult(null); setAsking(true); }} className="tap neu-btn inline-flex items-center rounded-lg px-3 py-1.5 text-small font-medium">
        {label}
      </button>
      {result && (
        <p role="status" className={`mt-2 text-small ${result.ok ? "text-slate-200" : "text-red-400"}`}>
          {result.text}
        </p>
      )}
    </div>
  );
}

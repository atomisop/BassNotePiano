"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/Toaster";

/** Clears the report list, after asking. */
export function CspClearButton({ onClear }: { onClear: () => Promise<{ ok: boolean; error?: string }> }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    const hold = await toast.held("Clearing the reports", () => onClear().catch(() => ({ ok: false, error: "That did not go through." })));
    setBusy(false);
    setAsking(false);
    if (hold.undone) return;
    const res = hold.value;
    if (!res.ok) return setError(res.error ?? "That did not go through.");
    router.refresh();
  }

  return asking ? (
    <span className="inline-flex flex-wrap items-center gap-2 text-small text-slate-300">
      Clear every report and start counting again?
      <Button type="button" disabled={busy} onClick={() => setAsking(false)} variant="secondary" size="sm">Not yet</Button>
      <Button type="button" disabled={busy} onClick={() => void go()} variant="danger" size="sm">Yes, clear</Button>
    </span>
  ) : (
    <span>
      <Button type="button" onClick={() => setAsking(true)} variant="secondary" size="sm">Clear reports</Button>
      {error && <span role="alert" className="ml-2 text-small text-red-400">{error}</span>}
    </span>
  );
}

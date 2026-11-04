"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
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
      <button type="button" disabled={busy} onClick={() => setAsking(false)} className={buttonVariants({ variant: "secondary", size: "sm" })}>Not yet</button>
      <button type="button" disabled={busy} onClick={() => void go()} className={buttonVariants({ variant: "danger", size: "sm" })}>Yes, clear</button>
    </span>
  ) : (
    <span>
      <button type="button" onClick={() => setAsking(true)} className={buttonVariants({ variant: "secondary", size: "sm" })}>Clear reports</button>
      {error && <span role="alert" className="ml-2 text-small text-red-400">{error}</span>}
    </span>
  );
}

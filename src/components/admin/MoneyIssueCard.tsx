"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/Toaster";
import type { MoneyFixId, MoneyIssue } from "@/lib/moneyCheck";

/** One thing the money check found, in plain words, with a two-step button for each way to fix it. */
export function MoneyIssueCard({ issue, onFix }: { issue: MoneyIssue; onFix: (key: string, fix: MoneyFixId) => Promise<{ ok: boolean; message: string }> }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<MoneyFixId | null>(null);
  const [busy, setBusy] = useState(false);

  async function apply(fix: MoneyFixId) {
    setBusy(true);
    const hold = await toast.held("Applying the fix", () => onFix(issue.key, fix).catch(() => ({ ok: false, message: "Something went wrong. Try again." })));
    setBusy(false);
    if (hold.undone) return;
    const result = hold.value;
    if (!result.ok) return void toast.warning(result.message);
    toast.success(result.message);
    setConfirming(null);
    router.refresh();
  }

  return (
    <div className="rounded-2xl bg-neu-base p-4 shadow-raised-low">
      <p className="text-small font-semibold text-slate-50">{issue.title}</p>
      <p className="mt-1 text-small text-slate-300">{issue.detail}</p>
      <div className="mt-3 space-y-2">
        {issue.fixes.map((fix) =>
          confirming === fix.id ? (
            <div key={fix.id} className="rounded-xl bg-neu-base p-3 shadow-pressed-low">
              <p className="text-small text-slate-300">{fix.hint}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => setConfirming(null)} disabled={busy} className="tap flex-1 rounded-full py-2 text-small font-medium text-slate-300 bg-neu-base shadow-raised-low disabled:opacity-50">Not now</button>
                <Button type="button" onClick={() => apply(fix.id)} disabled={busy} variant="primary" className="flex-1">
                  {busy ? "Fixing…" : "Yes, fix it"}
                </Button>
              </div>
            </div>
          ) : (
            <Button key={fix.id} type="button" onClick={() => setConfirming(fix.id)} variant="secondary" size="sm" className="mr-2">
              {fix.label}
            </Button>
          ),
        )}
      </div>
      <Link href={`/admin/users/${issue.personId}`} className="tap mt-3 inline-flex text-small font-medium text-signal-fg hover:underline">Open {issue.person}</Link>
    </div>
  );
}

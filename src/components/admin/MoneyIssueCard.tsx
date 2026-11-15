"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/Toaster";
import type { MoneyFixId, MoneyIssue } from "@/lib/moneyCheck";
import { CardFoot, CardHead } from "@/components/ui/CardKit";
import { ChevronRight } from "@/components/ui/appIcons";

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

  // The issue is the one loud line; who it is about is the quiet eyebrow, what is wrong the quiet line under it. The first fix is the
  // one primary button, any other fix sits quiet beside it, and each still asks before it changes anything.
  const open = issue.fixes.find((fix) => fix.id === confirming);
  return (
    <article className="rounded-card bg-neu-base p-4 shadow-raised-mid md:p-5">
      <CardHead as="p" eyebrow={issue.person} title={issue.title} />
      <p className="mt-2 text-small text-slate-400">{issue.detail}</p>
      {open ? (
        <div className="mt-4 rounded-control bg-slate-50/5 p-3 ring-1 ring-inset ring-slate-50/10">
          <p className="text-small text-slate-300">{open.hint}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => setConfirming(null)} disabled={busy} className={buttonVariants({ variant: "secondary", className: "flex-1" })}>Not now</button>
            <button type="button" onClick={() => apply(open.id)} disabled={busy} className={buttonVariants({ variant: "primary", className: "flex-1" })}>
              {busy ? "Fixing…" : "Yes, fix it"}
            </button>
          </div>
        </div>
      ) : (
        <CardFoot className="justify-between">
          <Link href={`/admin/users/${issue.personId}`} className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 gap-1" })}>
            Open {issue.person}
            <ChevronRight aria-hidden className="h-3.5 w-3.5" />
          </Link>
          <div className="flex flex-wrap justify-end gap-2">
            {issue.fixes.map((fix, i) => (
              <button key={fix.id} type="button" onClick={() => setConfirming(fix.id)} className={buttonVariants({ variant: i === 0 ? "primary" : "secondary", size: "sm" })}>
                {fix.label}
              </button>
            ))}
          </div>
        </CardFoot>
      )}
    </article>
  );
}

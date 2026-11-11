"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ShieldCheck, X } from "@/components/ui/appIcons";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/Toaster";
import { announceChange } from "@/lib/liveEvents";
import { respondToParentLinkAction } from "@/app/(dashboard)/parent/actions";

/**
 * A parent asking to link to this account, answered right on Home (a request made before the account existed arrives here on the first
 * visit). Accept or Decline uses the same answer as Settings > Parent mode; nothing is shared unless they accept.
 */
export function ParentRequestCard({ requests }: { requests: { linkId: string; parentName: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [answered, setAnswered] = useState<Record<string, boolean>>({});
  const waiting = requests.filter((r) => !(r.linkId in answered));
  if (waiting.length === 0) return null;

  async function answer(linkId: string, accept: boolean) {
    setBusy(`${linkId}:${accept}`);
    const result = await respondToParentLinkAction(linkId, accept).catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));
    setBusy(null);
    if (!result.ok) {
      toast.warning(result.error);
    } else {
      toast.success(accept ? "Linked" : "Declined");
    }
    setAnswered((prev) => ({ ...prev, [linkId]: accept }));
    announceChange("notifications", "status");
    router.refresh();
  }

  return (
    <section aria-label="Parent requests" className="space-y-3">
      {waiting.map((r) => (
        <div key={r.linkId} className="rounded-card bg-neu-base p-5 shadow-raised-low">
          <div className="flex items-start gap-3">
            <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-signal/12 text-signal-fg">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-body font-semibold text-slate-50">{r.parentName} wants to be your parent account</h2>
              <p className="mt-1 text-small text-slate-400">
                If you accept, they can see your progress, practice and classes, change your class times, and pay for your plan. You can end it any
                time in Settings. Nothing is shared unless you accept.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 sm:pl-[3.25rem]">
            <button type="button" disabled={busy !== null} onClick={() => void answer(r.linkId, true)} className={buttonVariants({ variant: "primary" })}>
              {busy === `${r.linkId}:true` ? <MorphingSquare size={12} className="shrink-0" /> : <Check aria-hidden className="h-4 w-4" />}
              Accept
            </button>
            <button type="button" disabled={busy !== null} onClick={() => void answer(r.linkId, false)} className={buttonVariants({ variant: "secondary" })}>
              {busy === `${r.linkId}:false` ? <MorphingSquare size={12} className="shrink-0" /> : <X aria-hidden className="h-4 w-4" />}
              Decline
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { Button } from "@/components/ui/button";
import { respondFamilyInviteAction } from "@/app/(dashboard)/billing/plans/actions";
import { toast } from "@/components/ui/Toaster";

type Invite = { id: string; payerName: string };

/** Someone asked you to join their group plan. Nothing is started for you unless you accept. */
export function FamilyInvitesPanel({ invites }: { invites: Invite[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (invites.length === 0) return null;

  async function answer(id: string, accept: boolean) {
    setError(null);
    if (!accept && !(await toast.hold("Declining the invite"))) return;
    setBusy(`${id}:${accept}`);
    const result = await respondFamilyInviteAction(id, accept).catch(() => ({ ok: false, error: "Something went wrong. Please try again." }));
    if (!result.ok) setError(result.error);
    setBusy(null);
    router.refresh();
  }

  return (
    <section aria-label="Group plan invitations" className="mb-6 space-y-3">
      {invites.map((invite) => (
        <div key={invite.id} className="rounded-xl bg-neu-base p-4 shadow-raised-low">
          <p className="text-body font-semibold text-slate-50">{invite.payerName} invited you to their group plan</p>
          <p className="mt-1 text-small text-slate-400">
            By accepting you agree to the{" "}
            <a href="/terms#family-plans" target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-200 underline underline-offset-2">
              group plan rules
            </a>
            .
          </p>
          <div className="mt-3 flex gap-2">
            <Button type="button" aria-busy={busy === `${invite.id}:true`} onClick={() => void answer(invite.id, true)} disabled={busy !== null} variant="primary" size="sm">
              {busy === `${invite.id}:true` && <MorphingSquare size={14} className="mr-2" />}
              Accept
            </Button>
            <Button type="button" aria-busy={busy === `${invite.id}:false`} onClick={() => void answer(invite.id, false)} disabled={busy !== null} variant="secondary" size="sm">
              {busy === `${invite.id}:false` && <MorphingSquare size={14} className="mr-2" />}
              Decline
            </Button>
          </div>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-small text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}

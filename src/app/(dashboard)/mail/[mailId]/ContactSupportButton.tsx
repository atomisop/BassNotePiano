"use client";

import { useState } from "react";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { openAtomWithCase } from "@/lib/atomTrigger";
import { contactSupportFromMailAction } from "../actions";

export function ContactSupportButton({ mailId, alreadyOpened }: { mailId: string; alreadyOpened: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(alreadyOpened);

  async function handleClick() {
    setBusy(true);
    setError(null);
    const result = await contactSupportFromMailAction(mailId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpened(true);
    openAtomWithCase(result.escalationId);
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="tap inline-flex items-center justify-center gap-2 rounded-xl bg-neu-base px-4 py-2.5 text-small font-semibold text-slate-100 shadow-raised-low transition hover:shadow-raised-mid active:shadow-pressed-low disabled:opacity-60"
      >
        {busy && <MorphingSquare size={13} className="shrink-0" />}
        {opened ? "Open your support chat" : "Contact support"}
      </button>
      {error && <p className="mt-2 text-small text-red-400">{error}</p>}
    </div>
  );
}

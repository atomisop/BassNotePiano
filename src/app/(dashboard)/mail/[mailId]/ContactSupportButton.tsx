"use client";

import { useState } from "react";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { openAtomWithCase } from "@/lib/atomTrigger";
import { contactSupportFromMailAction } from "../actions";
import { buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/Toaster";

export function ContactSupportButton({ mailId, alreadyOpened }: { mailId: string; alreadyOpened: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(alreadyOpened);

  async function handleClick() {
    setBusy(true);
    setError(null);
    const hold = await toast.held("Contacting support", () => contactSupportFromMailAction(mailId), { mail: true });
    setBusy(false);
    if (hold.undone) return;
    const result = hold.value;
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
        className={buttonVariants({ variant: "secondary" })}
      >
        {busy && <MorphingSquare size={13} className="shrink-0" />}
        {opened ? "Open your support chat" : "Contact support"}
      </button>
      {error && <p className="mt-2 text-small text-red-400">{error}</p>}
    </div>
  );
}

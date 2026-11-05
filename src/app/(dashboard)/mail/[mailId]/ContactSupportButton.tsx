"use client";

import { useState } from "react";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { openAtomWithCase } from "@/lib/atomTrigger";
import { contactSupportFromMailAction } from "../actions";
import { buttonVariants } from "@/components/ui/button";

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
        className={buttonVariants({ variant: "secondary" })}
      >
        {busy && <MorphingSquare size={13} className="shrink-0" />}
        {opened ? "Open your support chat" : "Contact support"}
      </button>
      {error && <p className="mt-2 text-small text-red-400">{error}</p>}
    </div>
  );
}

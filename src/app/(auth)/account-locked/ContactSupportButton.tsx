"use client";

import { openAtom } from "@/lib/atomTrigger";
import { buttonVariants } from "@/components/ui/button";

/** Opens the support chat (Atom, where "talk to a person" reaches the studio). */
export function ContactSupportButton() {
  return (
    <button type="button" onClick={() => openAtom()} className={buttonVariants({ variant: "primary", size: "lg" })}>
      Contact support
    </button>
  );
}

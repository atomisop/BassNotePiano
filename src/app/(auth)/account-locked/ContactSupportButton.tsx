"use client";

import { openAtom } from "@/lib/atomTrigger";
import { Button } from "@/components/ui/button";

/** Opens the support chat (Atom, where "talk to a person" reaches the studio). */
export function ContactSupportButton() {
  return (
    <Button type="button" onClick={() => openAtom()} variant="primary" size="lg">
      Contact support
    </Button>
  );
}

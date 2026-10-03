"use client";

import { useEffect } from "react";
import GenerateAIButton from "@/components/ui/button-33";
import { openAtom, setAtomTriggerPresent } from "@/lib/atomTrigger";

/** Top-bar trigger for Atom. While mounted, Atom's floating launcher hides. */
export function AskAiButton() {
  useEffect(() => {
    setAtomTriggerPresent(true);
    return () => setAtomTriggerPresent(false);
  }, []);

  // data-atom-trigger: Atom's greeting bubble reads this element's position to
  // sit right under the button.
  return (
    <span data-atom-trigger className="inline-flex">
      <GenerateAIButton label="Ask AI" onClick={openAi} className="h-9 px-4" />
    </span>
  );
}

function openAi() {
  openAtom();
}

"use client";

import { useEffect } from "react";
import GenerateAIButton from "@/components/ui/button-33";
import { openAtom, setAtomTriggerPresent } from "@/lib/atomTrigger";

/** Top-bar trigger for Atom. While mounted, Atom's floating launcher hides. */
export function AskAiButton({ compactOnPhones = false }: { compactOnPhones?: boolean }) {
  useEffect(() => {
    setAtomTriggerPresent(true);
    return () => setAtomTriggerPresent(false);
  }, []);

  // data-atom-trigger: Atom's greeting bubble reads this element's position to
  // sit right under the button.
  return (
    <span data-atom-trigger className="inline-flex">
      {compactOnPhones ? (
        // Icon only below md, to leave room for Log in / Get started: the label
        // is still there for screen readers and returns at md and up.
        <GenerateAIButton calm ariaLabel="Ask AI" onClick={openAi} className="tap h-9 px-3 md:px-4">
          <span className="hidden md:inline">Ask AI</span>
        </GenerateAIButton>
      ) : (
        <GenerateAIButton calm label="Ask AI" onClick={openAi} className="tap h-9 px-4" />
      )}
    </span>
  );
}

function openAi() {
  openAtom();
}

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

  return <GenerateAIButton label="Ask AI" onClick={openAi} className="h-9 px-4" />;
}

function openAi() {
  openAtom();
}

"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { ChangelogEntry } from "@/lib/changelog";
import { markPatchNotesSeenAction } from "@/app/(dashboard)/about/actions";
import { WhatsNewModal } from "./WhatsNewModal";

const WhatsNewContext = createContext<{ open: () => void } | null>(null);

/**
 * Owns the What's new card. It opens by itself once per account for each new
 * version (the server says whether this account has seen it), and the bulb in
 * the top bar opens it again at any time.
 */
export function WhatsNewProvider({
  entry,
  showInitially,
  children,
}: {
  entry: ChangelogEntry;
  showInitially: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(showInitially);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    void markPatchNotesSeenAction();
  }, []);

  return (
    <WhatsNewContext.Provider value={{ open }}>
      {children}
      <WhatsNewModal open={isOpen} onClose={close} entry={entry} />
    </WhatsNewContext.Provider>
  );
}

export function useWhatsNew() {
  return useContext(WhatsNewContext);
}

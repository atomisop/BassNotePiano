"use client";

import { useCallback, useState } from "react";
import type { ChangelogEntry } from "@/lib/changelog";
import { markPatchNotesSeenAction } from "@/app/(dashboard)/about/actions";
import { WhatsNewModal } from "./WhatsNewModal";

/** Owns the What's new card. It opens by itself once per account for each new version (the server says whether this account has seen it). */
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

  const close = useCallback(() => {
    setIsOpen(false);
    void markPatchNotesSeenAction();
  }, []);

  return (
    <>
      {children}
      <WhatsNewModal open={isOpen} onClose={close} entry={entry} />
    </>
  );
}

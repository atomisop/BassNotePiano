"use client";

import { useState } from "react";
import type { BadgeCode } from "@prisma/client";
import { BadgeGrid } from "@/components/gamification/BadgeGrid";
import { Dialog } from "@/components/ui/Dialog";

/**
 * Home's Badges card opens the whole set in a sheet (a bottom sheet on phones) instead of growing in place: the card sits in the
 * stacked card deck, and a card that suddenly grows many screens tall pulled the deck apart.
 */
export function BadgesSheetButton({ earnedCodes, total }: { earnedCodes: BadgeCode[]; total: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap mt-3 inline-flex items-center text-small font-semibold text-slate-300 underline-offset-4 hover:text-slate-50 hover:underline"
      >
        Show all badges
      </button>
      <Dialog open={open} onOpenChange={setOpen} title="Your badges" description={`${earnedCodes.length} of ${total} earned`}>
        <BadgeGrid earnedCodes={new Set(earnedCodes)} />
      </Dialog>
    </>
  );
}

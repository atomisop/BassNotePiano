"use client";

import { useState } from "react";
import type { BadgeCode } from "@prisma/client";
import { BadgeGrid } from "@/components/gamification/BadgeGrid";
import { Dialog } from "@/components/ui/Dialog";
import { Medal } from "@/components/ui/appIcons";
import { HOME_ROW_CLASS, HomeRowInner } from "@/components/home/HomeRow";
import { SHELF_CARD_CLASS, ShelfCardInner } from "@/components/home/ShelfCards";

/**
 * Home's Badges row opens the whole set in a sheet (a bottom sheet on phones) instead of growing in place, so the page never jumps.
 */
/** `card`: drawn as a card in Home's Studio shelf instead of a row. */
export function BadgesSheetButton({ earnedCodes, total, card = false }: { earnedCodes: BadgeCode[]; total: number; card?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={card ? SHELF_CARD_CLASS : HOME_ROW_CLASS} aria-haspopup="dialog">
        {card ? (
          <ShelfCardInner icon={<Medal />} title="Badges" detail={`${earnedCodes.length} of ${total} earned`} />
        ) : (
          <HomeRowInner icon={<Medal />} title="Badges" detail={`${earnedCodes.length} of ${total} earned`} />
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen} title="Your badges" description={`${earnedCodes.length} of ${total} earned`}>
        <BadgeGrid earnedCodes={new Set(earnedCodes)} />
      </Dialog>
    </>
  );
}

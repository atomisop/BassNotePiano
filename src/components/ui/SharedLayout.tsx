"use client";

import type { ComponentProps } from "react";
import { LayoutGroup, motion } from "framer-motion";
import { EASE_MOVE } from "@/lib/motionTokens";

/**
 * Revamp rule 20: the same `layoutId` on the card and its detail, the row and its sheet, or the tab and its indicator, so one thing
 * travels instead of two things swapping. This is the only place the app uses framer's layout animation. Moves use the ease-in-out
 * curve (rule 9), never a bounce (rule 13).
 */
export { LayoutGroup as SharedLayoutGroup };

export function SharedLayout({ id, ...props }: { id: string } & Omit<ComponentProps<typeof motion.div>, "layoutId">) {
  return <motion.div layout layoutId={id} transition={{ duration: 0.28, ease: EASE_MOVE }} {...props} />;
}

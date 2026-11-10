"use client";

import { motion } from "framer-motion";
import type { ScaleAccessState } from "@/lib/access";
import { ctaLabel } from "@/lib/ctaLabel";
import { cn } from "@/lib/utils";
import { Checklist, ScaleStateLabel, scaleState } from "@/components/progression/scaleStatusUi";
import { ArrowRight } from "@/components/ui/appIcons";
import { ScaleArt } from "@/components/progression/ScaleArt";

const gridContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.03 } },
};

const gridItem = {
  hidden: { opacity: 0, y: 14, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", bounce: 0, duration: 0.35 } },
};

export interface ScaleCardGridProps {
  roadmap: ScaleAccessState[];
  /** Slug of the one "you're here" scale, or null if it is not in this list. */
  currentSlug: string | null;
  onCardClick: (scale: ScaleAccessState) => void;
  /** On phones, cards from this position on are hidden (the roadmap's "Show all" button reveals them). */
  phoneHiddenFrom?: number;
  /** Where the scale pictures live, or null for plain cards. */
  artBase?: string | null;
}

/**
 * The learning path as a grid of middle-plane cards (STEP 2B). Each whole card is one tap target, and each reads in one order
 * (DESIGN.md, Hierarchy): the scale's name is the one loud line, its state is one word at the top right ("You're here", "Done",
 * "Waiting for teacher", "Locked"; a plain open scale needs none), progress is one figure, and the action is a quiet line at the foot.
 * - the "you're here" card is the selected item, so it alone carries the signal outline;
 * - locked scales are gray and quieter all through, never green.
 * The section's one green button is "Continue" in the next-step card above, so card actions here stay quiet text.
 */
export function ScaleCardGrid({ roadmap, currentSlug, onCardClick, phoneHiddenFrom, artBase = null }: ScaleCardGridProps) {
  return (
    <motion.ol
      variants={gridContainer}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {roadmap.map((scale, index) => {
        const locked = !scale.canAccess;
        const isCurrent = scale.scaleGroup.slug === currentSlug;
        const state = scaleState(scale, isCurrent);
        // A closed scale's state word already says what it is waiting for; only a missing plan gets a line of its own.
        const cta = locked ? (scale.lockedBecause === "not-yet-approved" ? null : ctaLabel(scale)) : ctaLabel(scale);

        return (
          <motion.li key={scale.scaleGroup.slug} variants={gridItem} className={cn("deck-card", phoneHiddenFrom !== undefined && index >= phoneHiddenFrom && "max-md:hidden")}>
            <button
              type="button"
              onClick={() => onCardClick(scale)}
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "group press-soft relative isolate flex h-full w-full cursor-pointer flex-col rounded-card bg-neu-base p-(--space-card) text-left shadow-raised-mid hover:shadow-raised-high active:shadow-pressed-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isCurrent && "shadow-pressed-mid ring-1 ring-signal",
                locked && "shadow-pressed-low",
                artBase && "scale-art-card",
              )}
            >
              {artBase && <ScaleArt src={`${artBase}/${scale.scaleGroup.slug}.jpg`} locked={locked} />}
              <div className="flex items-start justify-between gap-3">
                <p className="pt-0.5 text-caption font-medium uppercase tracking-caps text-slate-500">{scale.scaleGroup.code}</p>
                {state && <ScaleStateLabel state={state} className="shrink-0" />}
              </div>

              <h3 className={cn("mt-1 text-title font-semibold text-balance", locked ? "text-slate-400" : "text-slate-50")}>
                {scale.scaleGroup.title}
              </h3>
              {scale.scaleGroup.kinitName && <p className={cn("mt-0.5 text-small", locked ? "text-slate-500" : "text-slate-400")}>{scale.scaleGroup.kinitName}</p>}

              <div className="flex-1" />

              {!locked && <Checklist scale={scale} emphasised={isCurrent} />}

              {cta && (
                <span
                  className={cn(
                    "mt-4 inline-flex w-fit items-center gap-1.5 text-small font-semibold transition-colors",
                    locked ? "text-slate-500" : isCurrent ? "text-slate-50" : "text-slate-300 group-hover:text-slate-50",
                  )}
                >
                  {cta}
                  {!locked && <ArrowRight className="transition-transform group-hover:translate-x-0.5" size={14} />}
                </span>
              )}
            </button>
          </motion.li>
        );
      })}
    </motion.ol>
  );
}

"use client";

import { motion } from "framer-motion";
import type { ScaleAccessState } from "@/lib/access";
import { CheckIcon, LockIcon, STATUS_LABEL } from "@/components/progression/scaleStatusUi";

const listContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.015 } },
};

const listItem = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
};

export interface ScaleListRowsProps {
  roadmap: ScaleAccessState[];
  /** Slug of the one "you're here" scale, or null if it is not in this list. */
  currentSlug: string | null;
  onRowClick: (scale: ScaleAccessState) => void;
  /** On phones, rows from this position on are hidden (the roadmap's "Show all" button reveals them). */
  phoneHiddenFrom?: number;
}

/**
 * The actual fix for scrolling fatigue with 15 scales: one line per scale
 * (code + title + kinit name on the left, progress fraction + status/lock on
 * the right) instead of the grid's full card, genuinely denser than the
 * grid, not a re-skin of it, so a student can scan all 15 without heavy
 * scrolling.
 */
export function ScaleListRows({ roadmap, currentSlug, onRowClick, phoneHiddenFrom }: ScaleListRowsProps) {
  return (
    <motion.ol
      variants={listContainer}
      initial="hidden"
      animate="visible"
      className="divide-y divide-ink/[0.08] overflow-hidden rounded-card border border-ink/[0.08] bg-[rgb(var(--plane-mid-bg))] shadow-plane-mid"
    >
      {roadmap.map((scale, index) => {
        const locked = !scale.canAccess;
        const isCurrent = scale.scaleGroup.slug === currentSlug;
        const isCompleted = scale.status === "COMPLETED";
        const doneCount = [scale.moduleRead, scale.practiceCompleted, scale.quizPassed].filter(Boolean).length;

        return (
          <motion.li key={scale.scaleGroup.slug} variants={listItem} className={phoneHiddenFrom !== undefined && index >= phoneHiddenFrom ? "max-md:hidden" : undefined}>
            <button
              type="button"
              onClick={() => onRowClick(scale)}
              aria-current={isCurrent ? "step" : undefined}
              className={`flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-50/70 ${
                isCurrent ? "bg-signal/6 shadow-[inset_3px_0_0_rgb(var(--signal))]" : "hover:bg-ink/5"
              }`}
            >
              <span className="w-8 shrink-0 text-small font-semibold tabular-nums text-slate-400 sm:w-14 sm:uppercase sm:tracking-caps">
                {scale.scaleGroup.code.replace("Scale ", "#")}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className={`line-clamp-2 min-w-0 text-body font-semibold leading-snug sm:truncate ${locked ? "text-slate-400" : "text-slate-50"}`}>
                    {scale.scaleGroup.title}
                  </span>
                  {scale.scaleGroup.kinitName && (
                    <span className="hidden shrink-0 text-small text-slate-400 sm:inline">{scale.scaleGroup.kinitName}</span>
                  )}
                </span>
              </span>

              {!locked && (
                <span className="flex shrink-0 items-center gap-1 sm:gap-1.5" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className={`h-1.5 w-2.5 rounded-full sm:w-4 ${
                        i < doneCount ? "bg-slate-50" : "bg-neu-base shadow-pressed-low"
                      }`}
                    />
                  ))}
                </span>
              )}

              {/* On a phone the row is the name and a small mark (a lock, a check, or just the bars); the words come back from sm up.
                  The words stay in the page for screen readers either way. */}
              <span
                className={`flex shrink-0 items-center gap-1 text-small font-medium ${
                  isCurrent || isCompleted ? "text-slate-50" : locked ? "text-slate-500" : "text-slate-400"
                }`}
              >
                {locked && <LockIcon />}
                {isCompleted && <CheckIcon />}
                <span className="sr-only sm:not-sr-only">{isCurrent ? "You're here" : STATUS_LABEL[scale.status]}</span>
              </span>
            </button>
          </motion.li>
        );
      })}
    </motion.ol>
  );
}

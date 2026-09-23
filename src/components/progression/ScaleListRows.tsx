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
  currentIndex: number;
  onRowClick: (scale: ScaleAccessState) => void;
}

/**
 * The actual fix for scrolling fatigue with 15 scales: one line per scale
 * (code + title + kinit name on the left, progress fraction + status/lock on
 * the right) instead of the grid's full card — genuinely denser than the
 * grid, not a re-skin of it, so a student can scan all 15 without heavy
 * scrolling.
 */
export function ScaleListRows({ roadmap, currentIndex, onRowClick }: ScaleListRowsProps) {
  return (
    <motion.ol
      variants={listContainer}
      initial="hidden"
      animate="visible"
      className="divide-y divide-ink/10 overflow-hidden rounded-2xl border border-ink/10 bg-surface"
    >
      {roadmap.map((scale, index) => {
        const locked = !scale.canAccess;
        const isCurrent = index === currentIndex;
        const isCompleted = scale.status === "COMPLETED";
        const doneCount = [scale.moduleRead, scale.practiceCompleted, scale.quizPassed].filter(Boolean).length;

        return (
          <motion.li key={scale.scaleGroup.slug} variants={listItem}>
            <button
              type="button"
              onClick={() => onRowClick(scale)}
              aria-current={isCurrent ? "step" : undefined}
              className={`flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--c-s-50)/0.7)] ${
                isCurrent ? "bg-amber-400/[0.06]" : "hover:bg-ink/5"
              }`}
            >
              <span className="w-14 shrink-0 text-xs font-medium uppercase tracking-[0.15em] text-[rgb(var(--c-s-50)/0.8)]">
                {scale.scaleGroup.code.replace("Scale ", "#")}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="truncate font-serif text-sm text-slate-50 sm:text-base">
                    {scale.scaleGroup.title}
                  </span>
                  {scale.scaleGroup.kinitName && (
                    <span className="hidden shrink-0 text-xs text-slate-500 sm:inline">{scale.scaleGroup.kinitName}</span>
                  )}
                </span>
              </span>

              {!locked && (
                <span className="hidden shrink-0 items-center gap-1.5 sm:flex" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className={`h-1.5 w-4 rounded-full ${
                        i < doneCount ? (isCompleted ? "bg-emerald-400" : "bg-[rgb(var(--c-s-50))]") : "bg-slate-800"
                      }`}
                    />
                  ))}
                </span>
              )}

              <span
                className={`flex shrink-0 items-center gap-1 text-xs font-medium ${
                  isCurrent
                    ? "text-amber-400"
                    : isCompleted
                      ? "text-emerald-400"
                      : locked
                        ? "text-slate-600"
                        : "text-slate-500"
                }`}
              >
                {locked && <LockIcon />}
                {isCompleted && <CheckIcon />}
                {isCurrent ? "You're here" : STATUS_LABEL[scale.status]}
              </span>
            </button>
          </motion.li>
        );
      })}
    </motion.ol>
  );
}

"use client";

import { motion } from "framer-motion";
import type { ScaleAccessState } from "@/lib/access";
import { ctaLabel } from "@/lib/ctaLabel";
import { Checklist, LockIcon, STATUS_LABEL } from "@/components/progression/scaleStatusUi";

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
  currentIndex: number;
  onCardClick: (scale: ScaleAccessState) => void;
}

/**
 * The 15-scale grid, upgraded from the old 6-card version: a real responsive
 * multi-column grid rather than the single-column roadmap spine, so a
 * student sees a wide spread of scales at once. Card content (status,
 * title, kinit name, checklist, CTA) matches ScaleListRows exactly — only
 * the layout differs between the two views.
 */
export function ScaleCardGrid({ roadmap, currentIndex, onCardClick }: ScaleCardGridProps) {
  return (
    <motion.ol
      variants={gridContainer}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      {roadmap.map((scale, index) => {
        const locked = !scale.canAccess;
        const isCurrent = index === currentIndex;
        const isCompleted = scale.status === "COMPLETED";

        return (
          <motion.li key={scale.scaleGroup.slug} variants={gridItem}>
            <button
              type="button"
              onClick={() => onCardClick(scale)}
              aria-current={isCurrent ? "step" : undefined}
              className={`group flex h-full w-full cursor-pointer flex-col rounded-2xl border p-5 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--c-s-50)/0.7)] ${
                isCurrent
                  ? "border-amber-400/50 bg-surface shadow-card"
                  : locked
                    ? "border-ink/10 bg-ink/5 hover:border-[rgb(var(--c-s-50)/0.3)]"
                    : "border-ink/10 bg-surface hover:border-[rgb(var(--c-s-50)/0.3)]"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">
                  {scale.scaleGroup.code}
                </p>
                {isCurrent ? (
                  <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-medium text-amber-400">
                    You&apos;re here
                  </span>
                ) : (
                  <span className={`text-[11px] ${isCompleted ? "text-emerald-400" : "text-slate-500"}`}>
                    {STATUS_LABEL[scale.status]}
                  </span>
                )}
              </div>

              <h3 className={`mt-2 font-serif text-slate-50 ${isCurrent ? "text-xl" : "text-lg"}`}>
                {scale.scaleGroup.title}
              </h3>
              {scale.scaleGroup.kinitName && <p className="mt-1 text-sm text-slate-500">{scale.scaleGroup.kinitName}</p>}

              {!locked && <Checklist scale={scale} emphasised={isCurrent} />}

              <div className="flex-1" />

              <div
                className={`mt-5 inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  isCurrent
                    ? "cta-fill group-hover:brightness-110"
                    : "border border-[rgb(var(--c-s-50)/0.4)] text-[rgb(var(--c-s-50))] group-hover:border-[rgb(var(--c-s-50))] group-hover:bg-[rgb(var(--c-s-50)/0.1)]"
                }`}
              >
                {locked && <LockIcon />}
                {ctaLabel(scale)}
                {!locked && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden
                    className="transition-transform group-hover:translate-x-0.5"
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </button>
          </motion.li>
        );
      })}
    </motion.ol>
  );
}

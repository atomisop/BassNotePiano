"use client";

import { motion } from "framer-motion";
import type { ScaleAccessState } from "@/lib/access";
import { ctaLabel } from "@/lib/ctaLabel";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
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
  /** Slug of the one "you're here" scale, or null if it is not in this list. */
  currentSlug: string | null;
  onCardClick: (scale: ScaleAccessState) => void;
}

/**
 * The learning path as a grid of middle-plane cards (STEP 2B). Each whole
 * card is one tap target. Color follows STEP 2C:
 * - the "you're here" card is the selected item, so it alone carries the
 *   signal outline;
 * - status (completed, not started) is a neutral badge with an icon;
 * - locked scales are gray, never green.
 * The section's one green button is "Continue" in the next-step card above,
 * so card actions here stay quiet text.
 */
export function ScaleCardGrid({ roadmap, currentSlug, onCardClick }: ScaleCardGridProps) {
  return (
    <motion.ol
      variants={gridContainer}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
    >
      {roadmap.map((scale) => {
        const locked = !scale.canAccess;
        const isCurrent = scale.scaleGroup.slug === currentSlug;
        const isCompleted = scale.status === "COMPLETED";

        return (
          <motion.li key={scale.scaleGroup.slug} variants={gridItem}>
            <button
              type="button"
              onClick={() => onCardClick(scale)}
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "group flex h-full w-full cursor-pointer flex-col rounded-card border bg-[rgb(var(--plane-mid-bg))] p-(--space-card) text-left shadow-plane-mid transition-[transform,box-shadow,border-color] duration-(--dur-base) ease-(--ease-ios) hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:hover:translate-y-0",
                isCurrent ? "border-signal/60 shadow-signal" : "border-ink/[0.08] hover:border-ink/15",
                locked && "bg-transparent shadow-none",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-small font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {scale.scaleGroup.code}
                </p>
                {isCurrent ? (
                  <Badge>You&apos;re here</Badge>
                ) : isCompleted ? (
                  <Badge tone="success">{STATUS_LABEL[scale.status]}</Badge>
                ) : locked ? (
                  <Badge tone="locked">{STATUS_LABEL.LOCKED}</Badge>
                ) : (
                  <span className="text-small text-slate-400">{STATUS_LABEL[scale.status]}</span>
                )}
              </div>

              <h3 className={cn("mt-2 text-body font-semibold", locked ? "text-slate-400" : "text-slate-50")}>
                {scale.scaleGroup.title}
              </h3>
              {scale.scaleGroup.kinitName && <p className="mt-0.5 text-small text-slate-400">{scale.scaleGroup.kinitName}</p>}

              {!locked && <Checklist scale={scale} emphasised={isCurrent} />}

              <div className="flex-1" />

              <span
                className={cn(
                  "mt-4 inline-flex w-fit items-center gap-1.5 text-small font-semibold transition-colors",
                  locked ? "text-slate-500" : "text-slate-200 group-hover:text-slate-50",
                )}
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
              </span>
            </button>
          </motion.li>
        );
      })}
    </motion.ol>
  );
}

"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { BadgeCode } from "@prisma/client";
import { BADGES, type BadgeCategory } from "@/lib/badges";

const CATEGORY_LABELS: Record<BadgeCategory, string> = {
  COURSE: "Course completion",
  SOCIAL: "Social",
  STREAK: "Practice streaks",
};

const CATEGORY_ORDER: BadgeCategory[] = ["COURSE", "STREAK", "SOCIAL"];

interface BadgeGridProps {
  earnedCodes: Set<BadgeCode>;
}

function AwardIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
      <circle cx="12" cy="8" r="5" />
      <path d="M8.5 12.5 7 21l5-3 5 3-1.5-8.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" />
    </svg>
  );
}

// Earned tiles get a snappier, overshooting entrance than the rest of the
// site's standard spring (stiffness 240-260, damping 24-26) — this one
// moment is meant to feel like a reward, not just another item settling in.
const earnedTileVariants = {
  hidden: { opacity: 0, scale: 0.5 },
  visible: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.35, duration: 0.5 } },
};

const lockedTileVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
};

export function BadgeGrid({ earnedCodes }: BadgeGridProps) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <div className="space-y-6">
      {CATEGORY_ORDER.map((category) => {
        const badges = BADGES.filter((b) => b.category === category);
        return (
          <div key={category}>
            <p className="mb-2.5 text-small font-semibold uppercase tracking-[0.16em] text-slate-400">
              {CATEGORY_LABELS[category]}
            </p>
            <div className="flex flex-wrap gap-3">
              {badges.map((badge, index) => {
                const earned = earnedCodes.has(badge.code);
                return (
                  <div key={badge.code} className="group relative">
                    <motion.div
                      variants={earned ? earnedTileVariants : lockedTileVariants}
                      initial={prefersReducedMotion ? "visible" : "hidden"}
                      animate="visible"
                      transition={prefersReducedMotion ? { duration: 0 } : earned ? { delay: index * 0.04 } : undefined}
                      className={`flex h-16 w-16 flex-col items-center justify-center rounded-2xl border text-center transition ${
                        earned
                          ? "border-ink/20 bg-[rgb(var(--c-s-50)/0.1)] text-slate-50"
                          : "border-ink/10 bg-surface text-slate-600 opacity-50"
                      }`}
                    >
                      {earned ? <AwardIcon /> : <LockIcon />}
                    </motion.div>
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-44 -translate-x-1/2 glass-surface-subtle p-2.5 text-center opacity-0 shadow-lg transition group-hover:opacity-100">
                      <p className="text-small font-semibold text-slate-100">{badge.label}</p>
                      <p className="mt-0.5 text-small text-slate-400">{badge.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { BadgeCode } from "@prisma/client";
import { Medal } from "lucide-react";
import { BADGES, type BadgeCategory } from "@/lib/badges";

// Each finger level has its own metal or gem, so the seven badges are easy to tell apart at a glance.
const FINGER_TIERS = [
  { name: "Bronze", color: "#cd7f32" },
  { name: "Silver", color: "#c7ccd4" },
  { name: "Gold", color: "#f5c542" },
  { name: "Sapphire", color: "#5b8def" },
  { name: "Ruby", color: "#e5484d" },
  { name: "Amethyst", color: "#a78bfa" },
  { name: "Diamond", color: "#7dd3fc" },
] as const;

function fingerLevelOf(code: string): number | null {
  const match = /^FINGER_LEVEL_(\d+)$/.exec(code);
  return match ? Number(match[1]) : null;
}

const CATEGORY_LABELS: Record<BadgeCategory, string> = {
  COURSE: "Course completion",
  SOCIAL: "Social",
  STREAK: "Practice streaks",
  FINGER: "Daily finger exercises",
};

const CATEGORY_ORDER: BadgeCategory[] = ["FINGER", "COURSE", "STREAK", "SOCIAL"];

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
                          ? "border-transparent bg-[rgb(var(--c-s-50)/0.1)] text-slate-50 shadow-raised-low"
                          : "border-transparent text-slate-600 opacity-50 bg-neu-base shadow-raised-low"
                      }`}
                    >
                      {(() => {
                        const level = fingerLevelOf(badge.code);
                        const tier = level ? FINGER_TIERS[level - 1] : null;
                        if (tier && level) {
                          return (
                            <>
                              {earned ? <Medal className="h-7 w-7" strokeWidth={1.75} style={{ color: tier.color }} aria-hidden /> : <LockIcon />}
                              <span className="mt-0.5 text-small font-bold leading-none" style={earned ? { color: tier.color } : undefined}>
                                {level}
                              </span>
                            </>
                          );
                        }
                        return earned ? <AwardIcon /> : <LockIcon />;
                      })()}
                    </motion.div>
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-44 -translate-x-1/2 glass-surface-subtle p-2.5 text-center opacity-0 shadow-raised-mid transition group-hover:opacity-100">
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

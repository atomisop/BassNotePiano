"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { BadgeCode } from "@prisma/client";
import { BADGES, type BadgeCategory } from "@/lib/badges";
import { SPRING } from "@/lib/motionTokens";
import { Lock, Medal } from "@/components/ui/appIcons";

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
    <Medal className="shrink-0" size={26} />
  );
}

function LockIcon() {
  return (
    <Lock className="shrink-0" size={22} />
  );
}

// Earned tiles get a snappier, overshooting entrance than the rest of the
// site's standard spring (stiffness 240-260, damping 24-26), this one
// moment is meant to feel like a reward, not just another item settling in.
const earnedTileVariants = {
  hidden: { opacity: 0, scale: 0.5 },
  visible: { opacity: 1, scale: 1, transition: SPRING.lively },
};

const lockedTileVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
};

/**
 * What a badge is and how to earn it used to live in a hover tooltip over the tile, so on a phone or an iPad (no hover) nobody
 * could read it, and the fixed-width box ran past the screen edge (2026-11-02 audit). Now each tile is a button: a tap (or a
 * hover, or focus with the keyboard) shows that badge's name and description in a line under its row, where there is room.
 */
export function BadgeGrid({ earnedCodes }: BadgeGridProps) {
  const prefersReducedMotion = useReducedMotion();
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="space-y-6">
      {CATEGORY_ORDER.map((category) => {
        const badges = BADGES.filter((b) => b.category === category);
        const shown = badges.find((b) => b.code === selected) ?? null;
        return (
          <div key={category}>
            <p className="mb-2.5 text-small font-semibold uppercase tracking-caps text-slate-400">
              {CATEGORY_LABELS[category]}
            </p>
            <div className="flex flex-wrap gap-3">
              {badges.map((badge, index) => {
                const earned = earnedCodes.has(badge.code);
                const open = selected === badge.code;
                return (
                  <motion.button
                    key={badge.code}
                    type="button"
                    aria-pressed={open}
                    aria-label={`${badge.label}${earned ? ", earned" : ", not earned yet"}`}
                    onClick={() => setSelected(open ? null : badge.code)}
                    onMouseEnter={() => setSelected(badge.code)}
                    onFocus={() => setSelected(badge.code)}
                    variants={earned ? earnedTileVariants : lockedTileVariants}
                    initial={prefersReducedMotion ? "visible" : "hidden"}
                    animate="visible"
                    transition={prefersReducedMotion ? { duration: 0 } : earned ? { delay: index * 0.04 } : undefined}
                    className={`tap flex h-16 w-16 flex-col items-center justify-center rounded-2xl border text-center transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${
                      earned
                        ? "border-transparent bg-slate-50/10 text-slate-50 shadow-raised-low"
                        : "border-transparent text-slate-500 opacity-50 bg-neu-base shadow-raised-low"
                    } ${open ? "ring-2 ring-signal/70" : ""}`}
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
                  </motion.button>
                );
              })}
            </div>
            <div aria-live="polite" className="min-h-[1.5rem]">
              {shown && (
                <p className="mt-3 text-small text-slate-400">
                  <span className="font-semibold text-slate-100">{shown.label}.</span> {shown.description}
                  {!earnedCodes.has(shown.code) && <span className="text-slate-500"> Not earned yet.</span>}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

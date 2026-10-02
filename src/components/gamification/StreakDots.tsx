"use client";

import { motion, useReducedMotion } from "framer-motion";

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * The last seven days, today on the right. A streak is information, not
 * something to tap, so it is ink and paper only (STEP 2C, rule 2): practiced
 * days are filled paper, today is ringed. Each day is labelled for screen
 * readers, since the letters alone (two S, two T) are ambiguous.
 */
export function StreakDots({ currentStreak }: { currentStreak: number }) {
  const prefersReducedMotion = useReducedMotion();
  const filled = Math.min(currentStreak, 7);
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    return { letter: DAY_LETTERS[d.getDay()], name: DAY_NAMES[d.getDay()], isToday: i === 6, isFilled: i >= 7 - filled };
  });

  return (
    <ol className="mt-3 flex items-center justify-between gap-1.5" aria-label={`${currentStreak} day streak`}>
      {days.map((day, i) => {
        // Today's dot, once filled, pulses once so the moment the streak
        // extends reads as an event, not a silent color swap.
        const isMilestone = day.isToday && day.isFilled;
        return (
          <li key={i} className="relative flex h-8 w-8 items-center justify-center">
            {isMilestone && !prefersReducedMotion && (
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-full bg-slate-50"
                initial={{ opacity: 0.5, scale: 1 }}
                animate={{ opacity: 0, scale: 1.7 }}
                transition={{ duration: 1, repeat: 2, repeatDelay: 0.3, ease: "easeOut" }}
              />
            )}
            <span
              aria-label={`${day.isToday ? "Today" : day.name}: ${day.isFilled ? "practiced" : "not practiced"}`}
              className={`relative flex h-8 w-8 items-center justify-center rounded-full text-small font-semibold ${
                day.isFilled
                  ? "bg-slate-50 text-slate-950"
                  : `border text-slate-500 ${day.isToday ? "border-slate-300" : "border-ink/10"}`
              }`}
            >
              <span aria-hidden>{day.letter}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

"use client";

import { motion, useReducedMotion } from "framer-motion";

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

export function StreakDots({ currentStreak }: { currentStreak: number }) {
  const prefersReducedMotion = useReducedMotion();
  const filled = Math.min(currentStreak, 7);
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    return { letter: DAY_LETTERS[d.getDay()], isToday: i === 6, isFilled: i >= 7 - filled };
  });

  return (
    <div className="mt-2 flex items-center gap-1.5">
      {days.map((day, i) => {
        // The freshest evidence of the streak — today's dot, once it's
        // filled — gets a distinct pulse instead of just an instant color
        // swap, so the moment the streak actually extends reads as one.
        const isMilestone = day.isToday && day.isFilled;
        return (
          <span key={i} className="relative flex h-6 w-6 items-center justify-center">
            {isMilestone && !prefersReducedMotion && (
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-full bg-[rgb(var(--c-s-50))]"
                initial={{ opacity: 0.7, scale: 1 }}
                animate={{ opacity: 0, scale: 1.8 }}
                transition={{ duration: 1, repeat: 2, repeatDelay: 0.3, ease: "easeOut" }}
              />
            )}
            <span
              title={day.isToday ? "Today" : undefined}
              className={`relative flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold transition ${
                day.isFilled
                  ? "bg-[rgb(var(--c-s-50))] text-slate-950"
                  : `border text-slate-600 ${day.isToday ? "border-[rgb(var(--c-s-50)/0.5)]" : "border-ink/10"}`
              }`}
            >
              {day.letter}
            </span>
          </span>
        );
      })}
    </div>
  );
}

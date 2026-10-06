import type { BadgeCode } from "@prisma/client";

// Client-safe: no database imports here, so the practice screen can use these.

/** The daily requirement: 10 minutes of finger exercises. */
export const DAILY_GOAL_SECONDS = 600;

/**
 * Seven levels, each a run of consecutive days with the full 10 minutes done.
 * Deliberately long: the top level is two straight years.
 */
export const FINGER_LEVELS: { level: number; days: number; label: string; code: BadgeCode }[] = [
  { level: 1, days: 7, label: "Warm-up", code: "FINGER_LEVEL_1" },
  { level: 2, days: 21, label: "Steady Hands", code: "FINGER_LEVEL_2" },
  { level: 3, days: 50, label: "Dedicated", code: "FINGER_LEVEL_3" },
  { level: 4, days: 100, label: "Committed", code: "FINGER_LEVEL_4" },
  { level: 5, days: 200, label: "Disciplined", code: "FINGER_LEVEL_5" },
  { level: 6, days: 365, label: "Year of Fingers", code: "FINGER_LEVEL_6" },
  { level: 7, days: 730, label: "Virtuoso", code: "FINGER_LEVEL_7" },
];

export interface FingerPracticeStatus {
  todaySeconds: number;
  completedToday: boolean;
  streak: number;
}


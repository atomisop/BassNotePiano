import type { BadgeCode } from "@prisma/client";
import { SCALE_GROUPS } from "@/lib/curriculum";

export type BadgeCategory = "COURSE" | "SOCIAL" | "STREAK" | "FINGER";

export interface BadgeDefinition {
  code: BadgeCode;
  label: string;
  /** Shown in the tooltip on a locked badge, what it takes to unlock it. */
  description: string;
  category: BadgeCategory;
}

// Fixed content, not admin-editable, a plain list rather than a DB table,
// same pattern as the curriculum's SCALE_GROUPS. SOCIAL badges are defined
// here (and can display as permanently-locked) even though nothing awards
// them yet, the friends system they depend on doesn't exist until a later
// step; adding their detection logic then won't require touching this list.
export const BADGES: BadgeDefinition[] = [
  {
    code: "FIRST_LESSON_DONE",
    label: "First Lesson Done",
    description: "Complete your first scale.",
    category: "COURSE",
  },
  {
    code: "SCALE_MASTER",
    label: "Scale Master",
    description: "Complete 4 scales.",
    category: "COURSE",
  },
  {
    code: "RHYTHM_SPECIALIST",
    label: "Rhythm Specialist",
    description: "Complete 8 scales.",
    category: "COURSE",
  },
  {
    code: "CHORD_MAESTRO",
    label: "Chord Maestro",
    description: "Complete 12 scales.",
    category: "COURSE",
  },
  {
    code: "COURSE_GRADUATE",
    label: "Course Graduate",
    description: `Complete all ${SCALE_GROUPS.length} scales.`,
    category: "COURSE",
  },
  {
    code: "FIRST_FRIEND_ADDED",
    label: "First Friend Added",
    description: "Add your first friend.",
    category: "SOCIAL",
  },
  {
    code: "COMMUNITY_CATALYST",
    label: "Community Catalyst",
    description: "Have 5 or more friends.",
    category: "SOCIAL",
  },
  {
    code: "ACTIVE_PRACTICE_PARTNER",
    label: "Active Practice Partner",
    description: "Practice together with a friend regularly.",
    category: "SOCIAL",
  },
  {
    code: "STREAK_3_DAY",
    label: "3-Day Streak",
    description: "Practice 3 days in a row.",
    category: "STREAK",
  },
  {
    code: "STREAK_7_DAY",
    label: "7-Day Streak",
    description: "Practice 7 days in a row.",
    category: "STREAK",
  },
  {
    code: "STREAK_30_DAY",
    label: "30-Day Streak",
    description: "Practice 30 days in a row.",
    category: "STREAK",
  },
  {
    code: "FINGER_LEVEL_1",
    label: "Finger Level 1: Warm-up",
    description: "Finish the daily 10 minutes of finger exercises 7 days in a row.",
    category: "FINGER",
  },
  {
    code: "FINGER_LEVEL_2",
    label: "Finger Level 2: Steady Hands",
    description: "Finish the daily 10 minutes of finger exercises 21 days in a row.",
    category: "FINGER",
  },
  {
    code: "FINGER_LEVEL_3",
    label: "Finger Level 3: Dedicated",
    description: "Finish the daily 10 minutes of finger exercises 50 days in a row.",
    category: "FINGER",
  },
  {
    code: "FINGER_LEVEL_4",
    label: "Finger Level 4: Committed",
    description: "Finish the daily 10 minutes of finger exercises 100 days in a row.",
    category: "FINGER",
  },
  {
    code: "FINGER_LEVEL_5",
    label: "Finger Level 5: Disciplined",
    description: "Finish the daily 10 minutes of finger exercises 200 days in a row.",
    category: "FINGER",
  },
  {
    code: "FINGER_LEVEL_6",
    label: "Finger Level 6: Year of Fingers",
    description: "Finish the daily 10 minutes of finger exercises 365 days in a row.",
    category: "FINGER",
  },
  {
    code: "FINGER_LEVEL_7",
    label: "Finger Level 7: Virtuoso",
    description: "Finish the daily 10 minutes of finger exercises 730 days in a row.",
    category: "FINGER",
  },
];

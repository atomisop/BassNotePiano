import type { BadgeCode } from "@prisma/client";

export type BadgeCategory = "COURSE" | "SOCIAL" | "STREAK";

export interface BadgeDefinition {
  code: BadgeCode;
  label: string;
  /** Shown in the tooltip on a locked badge — what it takes to unlock it. */
  description: string;
  category: BadgeCategory;
}

// Fixed content, not admin-editable — a plain list rather than a DB table,
// same pattern as the curriculum's SCALE_GROUPS. SOCIAL badges are defined
// here (and can display as permanently-locked) even though nothing awards
// them yet — the friends system they depend on doesn't exist until a later
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
    description: "Complete 2 scales.",
    category: "COURSE",
  },
  {
    code: "RHYTHM_SPECIALIST",
    label: "Rhythm Specialist",
    description: "Complete 4 scales.",
    category: "COURSE",
  },
  {
    code: "CHORD_MAESTRO",
    label: "Chord Maestro",
    description: "Complete 5 scales.",
    category: "COURSE",
  },
  {
    code: "COURSE_GRADUATE",
    label: "Course Graduate",
    description: "Complete all 6 scales.",
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
];

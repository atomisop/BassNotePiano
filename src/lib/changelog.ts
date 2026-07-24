export interface ChangelogEntry {
  version: string;
  date: string; // "YYYY-MM-DD", shown as-is
  title: string;
  items: string[];
}

// Newest first. CURRENT_VERSION and the "What's new" popup always reflect
// entries[0] — there's no per-version read tracking, just a once-per-day
// popup (see lastSeenPatchNotesAt on User), so this list only needs to stay
// truthful, not perfectly granular.
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.2.0",
    date: "2026-07-23",
    title: "A new look, and Messages gets smarter",
    items: [
      "Redesigned the whole app with a modern glass look and a permanent sidebar that stays put while you scroll",
      "Pin your favorite conversations to a grid at the top of Messages",
      "See when a friend is typing back, in real time",
      "Notifications now open in a full-screen view instead of a small dropdown",
      "Account settings moved into clearer tabs, and profile editing now lives on your Profile page",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-07-23",
    title: "Badges, streaks, friends, and messaging",
    items: [
      "Earn badges for completing scales and keeping up a practice streak",
      "Add friends by username and message them directly",
      "A new notification bell keeps you posted on requests, payments, and more",
      "A short onboarding walkthrough now greets new accounts",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-07-22",
    title: "Bass Note Piano launches",
    items: [
      "The full Ethiopian kiñit curriculum — Tizita, Bati, Anchihoye, and Mixolydian pentatonics — spelled correctly in every key",
      "Pay-as-you-go per scale, or one-time lifetime Pro access",
      "Secure accounts with email verification and two-factor login",
    ],
  },
];

export const CURRENT_VERSION = CHANGELOG[0].version;
export const LATEST_ENTRY = CHANGELOG[0];

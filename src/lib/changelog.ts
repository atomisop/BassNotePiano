export interface ChangelogEntry {
  version: string;
  date: string; // "YYYY-MM-DD", shown as-is
  title: string;
  items: string[];
}

// Newest first. CURRENT_VERSION and the "What's new" popup always reflect
// entries[0]. Read tracking is a single timestamp, not a per-version flag
// (see lastSeenPatchNotesAt on User) — the popup shows once by comparing
// that timestamp against entries[0].date, so adding a new entry here with
// today's date is what makes it reappear for everyone. Backdating an entry
// or leaving its date stale would suppress it; keep dates truthful.
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.5.0",
    date: "2026-08-24",
    title: "Live classes move to Discord",
    items: [
      "Weekly live group classes now happen on Discord instead of Zoom, join the server from the classes page or your account settings",
    ],
  },
  {
    version: "1.4.0",
    date: "2026-08-08",
    title: "Bigger profile photos",
    items: [
      "Profile photo uploads now accept images up to 10MB, resized automatically in your browser first, so it still uploads fast",
    ],
  },
  {
    version: "1.3.0",
    date: "2026-08-07",
    title: "Weekly live classes, direct messages, and announcements",
    items: [
      "Live group classes on Zoom replace 1:1 lesson booking, pick from six recurring weekly slots, pay with simple credit bundles, and cancel 24+ hours ahead for a refund",
      "We can now message you directly, replies land right in your existing Messages inbox",
      "Site announcements show up as a dismissible banner and a bell notification, so you never miss the news",
      "Logging in, and changing your password, name, or photo, no longer need a confirmation code, just your password",
    ],
  },
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
      "The full Ethiopian scale curriculum, Tizita, Bati, Anchihoye, and Mixolydian pentatonics, spelled correctly in every key",
      "Pay-as-you-go per scale, or one-time lifetime Pro access",
      "Secure accounts with email verification and two-factor login",
    ],
  },
];

export const CURRENT_VERSION = CHANGELOG[0].version;
export const LATEST_ENTRY = CHANGELOG[0];

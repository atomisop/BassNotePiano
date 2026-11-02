export interface ChangelogEntry {
  version: string;
  date: string; // "YYYY-MM-DD", shown as-is
  title: string;
  items: string[];
}

// Newest first. The "What's new" popup always shows entries[0], once per
// account: the account remembers the version it has shown, so a new top entry
// with a new version number is what makes it appear again for everyone.
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "2.1.0",
    date: "2026-11-02",
    title: "Friends to practice with, and one place for help",
    items: [
      "Friends has its own tab in the dock. Tap a friend to see their streak, badges and practice this week, and tap Nudge to remind them to practice",
      "Writing to the studio now lives in your Inbox, under Support, next to your notifications and Mail",
      "Chat between students has been removed",
    ],
  },
  {
    version: "2.0.0",
    date: "2026-10-06",
    title: "The biggest update yet",
    items: [
      "Daily 10-minute finger exercises for piano, guitar and bass, with a metronome, hand and finger guides, and seven streak levels with their own badges. Your lessons open once the day's practice is done",
      "A new Inbox: notifications and Mail in one place, with payments, billing and notes from the team grouped under Mail",
      "Booking is quicker: pick a day, pick a time, confirm. Subscribers choose their weekly day and time on a calendar",
      "Pay by Zelle or Venmo, and use any credits you have when you book an extra class",
      "Messages now show when yours is read and who is typing in a group, and you can react to any message",
      "The virtual instruments light up only the note you play",
      "Log in with a code sent to your email, and land straight in the app",
    ],
  },
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

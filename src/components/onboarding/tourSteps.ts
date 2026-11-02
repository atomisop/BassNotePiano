// Pure content, kept separate from the tour engine so the steps read like
// a checklist and are easy to add to/reorder without touching any of the
// positioning/rendering logic in OnboardingTour.tsx.
//
// `target` is a data-tour value, the nav ones (nav-*) live on AppDock's
// links, nav-profile on TopBar's avatar link, notification-bell on
// NotificationBell. (Sidebar/MobileTabBar/MoreSheet carry old copies of
// some of these too, a leftover from before AppDock replaced them, inert,
// since nothing renders those components anymore.) Steps with no target
// render as a centered card with no spotlight (used for the opening and
// closing steps). If a step's target isn't found in the DOM, the tour
// skips straight past it rather than getting stuck, see OnboardingTour's
// findStep().
export interface TourStep {
  id: string;
  target: string | null;
  title: string;
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    target: null,
    title: "Welcome to Bass Note Piano",
    body: "Here's a quick tour of where everything lives. Skip anytime. This only ever shows automatically once.",
  },
  {
    id: "roadmap",
    target: "nav-roadmap",
    title: "Your roadmap",
    body: "Your course, one scale at a time. Read each module, practice, take the quiz, and your teacher opens the next scale.",
  },
  {
    id: "lessons",
    target: "nav-lessons",
    title: "Online lessons",
    body: "Book a live weekly class on Discord using class credits, whenever you want real-time coaching alongside the self-paced curriculum.",
  },
  {
    id: "friends",
    target: "nav-friends",
    title: "Friends",
    body: "Up in the top bar: add friends by username, see each other's profile and send a nudge to practice.",
  },
  {
    id: "bell",
    target: "notification-bell",
    title: "Notifications",
    body: "Payments, announcements and your chat with the studio all land here. Open the Support tab any time you need help.",
  },
  {
    id: "profile",
    target: "nav-profile",
    title: "Your profile",
    body: "Badges, streaks, and your photo live here. This is what other students see.",
  },
  {
    id: "settings",
    target: "nav-settings",
    title: "Settings",
    body: "Manage your password, notification preferences, and purchase history.",
  },
  {
    id: "done",
    target: null,
    title: "You're all set",
    body: "Replay this tour any time from Settings → Tutorials.",
  },
];

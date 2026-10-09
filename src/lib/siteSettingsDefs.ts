// Every admin-controllable setting, in one list. No imports, so the admin page
// (a client component) and the server code that enforces each one read the same
// definitions. A setting only belongs here if some code actually reads it.

export type SettingValue = boolean | number | string;

interface BaseDef {
  key: string;
  category: SettingCategory;
  label: string;
  help: string;
  /** Overrides the stored AppSetting key (used for switches that existed before this page). */
  storageKey?: string;
}
export interface ToggleDef extends BaseDef {
  type: "toggle";
  default: boolean;
}
export interface NumberDef extends BaseDef {
  type: "number";
  default: number;
  min: number;
  max: number;
  unit?: string;
}
export interface TextDef extends BaseDef {
  type: "text";
  default: string;
  maxLength: number;
  multiline?: boolean;
}
export type SettingDef = ToggleDef | NumberDef | TextDef;

export const SETTING_CATEGORIES = [
  { id: "booking", label: "Booking", blurb: "Who can book a class, and how far ahead." },
  { id: "cancellation", label: "Cancel and reschedule", blurb: "What students may change themselves." },
  { id: "trial", label: "Trial and access", blurb: "Free trial, grace periods, and how scales unlock." },
  { id: "signup", label: "Sign-up", blurb: "Who can create an account." },
  { id: "phone", label: "Phone numbers", blurb: "Phone numbers on file, and optional text confirmation." },
  { id: "security", label: "Security", blurb: "Emailed codes and sign-in protection." },
  { id: "reminders", label: "Reminders and alerts", blurb: "Messages students and you receive." },
  { id: "discord", label: "Discord live classes", blurb: "How class calls are opened and who is told." },
  { id: "payments", label: "Payments and plans", blurb: "Installments and lapsing." },
  { id: "messaging", label: "Messaging", blurb: "Student messages and group chats." },
  { id: "atom", label: "Atom and support", blurb: "The assistant and the human handoff." },
] as const;
export type SettingCategory = (typeof SETTING_CATEGORIES)[number]["id"];

export const SETTING_DEFS: SettingDef[] = [
  // ---- Booking
  { key: "booking.paused", category: "booking", type: "toggle", default: false, label: "Pause all new bookings", help: "Students cannot book any class while this is on. Existing bookings are untouched." },
  { key: "booking.pausedMessage", category: "booking", type: "text", default: "Booking is paused for now. Please check back soon.", maxLength: 200, label: "Message shown while paused", help: "What a student sees when they try to book during a pause." },
  { key: "booking.allowSameDay", category: "booking", type: "toggle", default: true, label: "Allow same-day booking", help: "Off: a class can only be booked for a later calendar day (US Eastern)." },
  { key: "booking.minNoticeHours", category: "booking", type: "number", default: 0, min: 0, max: 168, unit: "hours", label: "Minimum notice to book", help: "A class must start at least this many hours from now. 0 means no minimum." },
  { key: "booking.horizonWeeks", category: "booking", type: "number", default: 8, min: 1, max: 12, unit: "weeks", label: "How far ahead students can book", help: "How many upcoming weeks of each weekly slot are offered." },
  { key: "booking.perHourLimit", category: "booking", type: "number", default: 20, min: 1, max: 100, unit: "per hour", label: "Booking attempts per student per hour", help: "Stops a script from hammering the booking screen." },
  { key: "booking.allowFamily", category: "booking", type: "toggle", default: true, label: "Allow family bookings", help: "Off: only one-student bookings can be made." },
  { key: "booking.subscriberClassesPerWeek", category: "booking", type: "number", default: 1, min: 1, max: 7, unit: "classes", label: "Credit classes per week for subscribers", help: "How many classes a subscriber may hold in one week through credits." },
  { key: "booking.notifyAdminOnBooking", category: "booking", type: "toggle", default: true, label: "Tell admins when a student books", help: "Sends the in-app and email notice for each new booking." },

  // ---- Cancel and reschedule
  { key: "cancel.studentCanCancel", category: "cancellation", type: "toggle", default: true, label: "Students can cancel their own classes", help: "Off: students must message you to cancel." },
  { key: "cancel.cutoffHours", category: "cancellation", type: "number", default: 24, min: 0, max: 168, unit: "hours", label: "Cancellation cutoff", help: "A student can cancel only if the class is at least this far away." },
  { key: "cancel.studentCanReschedule", category: "cancellation", type: "toggle", default: true, label: "Students can reschedule their own classes", help: "Off: students must message you to move a class." },
  { key: "cancel.rescheduleCutoffHours", category: "cancellation", type: "number", default: 24, min: 0, max: 168, unit: "hours", label: "Reschedule cutoff", help: "A student can move a class only if it is at least this far away." },

  // ---- Trial and access
  { key: "trial.enabled", category: "trial", type: "toggle", default: true, label: "Free trial for new students", help: "Off: approving an application or registering no longer starts a trial." },
  { key: "trial.days", category: "trial", type: "number", default: 3, min: 1, max: 30, unit: "days", label: "Trial length", help: "How long a new trial lasts." },
  { key: "trial.lessonCount", category: "trial", type: "number", default: 3, min: 1, max: 20, unit: "lessons", label: "Lessons open during the trial", help: "How many of Scale 1's first lessons a trial student can open." },
  { key: "access.planGraceDays", category: "trial", type: "number", default: 3, min: 0, max: 30, unit: "days", label: "Grace period after a plan's paid month", help: "Curriculum access continues this long after the paid period ends." },
  { key: "access.scaleUnlockIntervalDays", category: "trial", type: "number", default: 7, min: 0, max: 60, unit: "days", label: "Days between scale unlocks", help: "A student becomes eligible for the next scale this long after the last unlock." },
  { key: "access.autoApproveScales", category: "trial", type: "toggle", default: false, storageKey: "auto_approve_scales", label: "Release the next scale automatically", help: "When a student is ready, skip your approval click." },
  { key: "access.autoApproveApplications", category: "trial", type: "toggle", default: false, storageKey: "auto_approve_applications", label: "Approve class applications automatically", help: "New applications are accepted without review." },

  // ---- Sign-up
  { key: "signup.open", category: "signup", type: "toggle", default: true, label: "Allow new sign-ups", help: "Off: the register form refuses new accounts. Existing students are unaffected." },
  { key: "signup.closedMessage", category: "signup", type: "text", default: "New sign-ups are closed right now. Please check back soon.", maxLength: 200, label: "Message shown when sign-ups are closed", help: "What a visitor sees when they try to register." },
  { key: "signup.requireFullName", category: "signup", type: "toggle", default: true, label: "Require first and last name", help: "Off: a single name is accepted at sign-up." },
  { key: "phone.askAtSignup", category: "phone", type: "toggle", default: true, label: "Ask for a phone number at sign-up", help: "New students must enter a real number to create an account. It is checked for realness and cannot be a number another account already has, but it is not proven theirs; payments only use it as an extra clue." },
  { key: "phone.verifyBySms", category: "phone", type: "toggle", default: false, label: "Confirm numbers with a 6-digit text", help: "Off: numbers are kept as typed. On: new accounts must confirm theirs by text before using the app. Needs a text-message service set up on the server (Plivo keys), so it costs money per text." },
  { key: "signup.blockDisposable", category: "signup", type: "toggle", default: true, label: "Block throwaway email addresses", help: "Refuses sign-ups from disposable email domains." },

  { key: "phone.promptExisting", category: "phone", type: "toggle", default: true, label: "Ask existing students for a phone number", help: "Shows a short popup once per sign-in to anyone who has no number on file (or none confirmed, when text confirmation is on). They are never locked out." },
  { key: "phone.promptSeconds", category: "phone", type: "number", default: 5, min: 3, max: 30, unit: "seconds", label: "How long the phone popup stays", help: "A bar on the popup runs out over this time, then it closes by itself." },

  // ---- Security
  { key: "security.loginMaxAttempts", category: "security", type: "number", default: 8, min: 3, max: 50, unit: "tries", label: "Wrong passwords before a lockout", help: "Counted per account over the window below." },
  { key: "security.loginLockoutMinutes", category: "security", type: "number", default: 15, min: 1, max: 240, unit: "minutes", label: "Sign-in lockout window", help: "How long wrong passwords are counted, and how long a lockout lasts." },
  { key: "security.codeExpiryMinutes", category: "security", type: "number", default: 10, min: 2, max: 60, unit: "minutes", label: "Emailed code lifetime", help: "How long a 6-digit code works." },
  { key: "security.maxCodeAttempts", category: "security", type: "number", default: 5, min: 1, max: 20, unit: "tries", label: "Wrong tries per code", help: "A code is cancelled after this many wrong entries." },
  { key: "security.codeIssueLimit", category: "security", type: "number", default: 5, min: 1, max: 30, unit: "codes", label: "Codes that can be requested per window", help: "Per email address and purpose." },
  { key: "security.codeIssueWindowMinutes", category: "security", type: "number", default: 15, min: 1, max: 120, unit: "minutes", label: "Code request window", help: "The window that the limit above counts over." },

  // ---- Reminders and alerts
  { key: "reminders.classDayBefore", category: "reminders", type: "toggle", default: true, label: "Remind students the day before class", help: "The 'Your class is tomorrow' notice." },
  { key: "reminders.classHourBefore", category: "reminders", type: "toggle", default: true, label: "Remind students shortly before class", help: "The 'Your class starts soon' notice." },
  { key: "reminders.practiceEnabled", category: "reminders", type: "toggle", default: true, label: "Practice reminders", help: "Nudges students who have stopped practicing." },
  { key: "reminders.practiceDays", category: "reminders", type: "text", default: "1,3,7,14,30", maxLength: 40, label: "Days of silence that trigger a practice reminder", help: "Comma-separated, such as 1,3,7,14,30." },
  { key: "reminders.creditExpiryWarningDays", category: "reminders", type: "number", default: 5, min: 1, max: 30, unit: "days", label: "Warn before credits expire", help: "How many days ahead a student is told their credits are about to expire." },
  { key: "reminders.adminDailySummary", category: "reminders", type: "toggle", default: true, label: "Morning summary email to you", help: "The daily owner email." },

  // ---- Discord
  { key: "discord.enabled", category: "discord", type: "toggle", default: true, label: "Create Discord class calls", help: "Off: no private call is opened for any class." },
  { key: "discord.openBeforeMinutes", category: "discord", type: "number", default: 5, min: 1, max: 60, unit: "minutes", label: "Open the call this long before class", help: "The channel appears this many minutes ahead." },
  { key: "discord.closeAfterMinutes", category: "discord", type: "number", default: 5, min: 0, max: 120, unit: "minutes", label: "Keep the call open after class ends", help: "The channel is removed this long after the class finishes." },
  { key: "discord.addOwner", category: "discord", type: "toggle", default: true, label: "Add me to every class call", help: "Gives your connected Discord account access to each call." },
  { key: "discord.notifyOwner", category: "discord", type: "toggle", default: true, label: "Notify me with a join link when a call opens", help: "An in-app notice with a link straight to the call." },
  { key: "discord.notifyStudents", category: "discord", type: "toggle", default: true, label: "Notify students when their call opens", help: "The 'Your class call is open' notice with a join link." },
  { key: "discord.autoMove", category: "discord", type: "toggle", default: true, label: "Move people into the call if they are already in a voice channel", help: "Discord only lets the bot move someone who is already connected to voice." },
  { key: "discord.testChannelMinutes", category: "discord", type: "number", default: 10, min: 1, max: 60, unit: "minutes", label: "How long the test call stays", help: "For the test button on the Lessons page." },

  // ---- Payments
  { key: "payments.installmentLeadDays", category: "payments", type: "number", default: 7, min: 0, max: 30, unit: "days", label: "Open an installment this early", help: "How many days before the due date the next installment can be paid." },
  { key: "payments.emailAutoApprove", category: "payments", type: "toggle", default: true, label: "Approve payments from matching bank emails", help: "Off: receipts are still kept, but every payment waits for you to approve it." },
  { key: "payments.amountMismatchNotice", category: "payments", type: "toggle", default: true, label: "Tell a student when their payment amount is wrong", help: "The notice sent when the money arrives under their name for a different amount." },
  { key: "payments.askPhone", category: "payments", type: "toggle", default: true, label: "Ask for a phone number when someone pays", help: "The payment sheet asks for the phone number they pay from, before showing the payment code. It must match the number on their own account (typed to confirm, with a green check), so nobody can pay as someone else. A bank email that shows the same number helps find the right payment." },
  { key: "payments.lapseAfterDays", category: "payments", type: "number", default: 7, min: 1, max: 60, unit: "days", label: "Cancel an unpaid plan after", help: "A plan this many days past due with nothing in review is cancelled." },

  // ---- Messaging
  { key: "messaging.enabled", category: "messaging", type: "toggle", default: true, label: "Allow student messages", help: "Off: direct messages between students are refused. Admin messages still work." },
  { key: "messaging.reactionsEnabled", category: "messaging", type: "toggle", default: true, label: "Allow emoji reactions", help: "Off: students cannot react to messages." },
  { key: "messaging.maxLength", category: "messaging", type: "number", default: 2000, min: 100, max: 10000, unit: "characters", label: "Longest message", help: "Applies to direct and group messages." },
  { key: "messaging.groupsEnabled", category: "messaging", type: "toggle", default: true, label: "Allow group chats", help: "Off: new group chats cannot be made." },
  { key: "messaging.maxGroupMembers", category: "messaging", type: "number", default: 24, min: 3, max: 100, unit: "people", label: "Largest group chat", help: "Including the person who makes it." },

  // ---- Atom and support
  { key: "atom.enabled", category: "atom", type: "toggle", default: true, label: "Atom answers questions", help: "Off: Atom says it is unavailable and offers the human handoff." },
  { key: "atom.maxConversationMessages", category: "atom", type: "number", default: 20, min: 4, max: 40, unit: "messages", label: "Conversation memory", help: "How many recent messages Atom reads for each answer. Fewer is cheaper." },
  { key: "atom.handoffEnabled", category: "atom", type: "toggle", default: true, label: "Allow handoff to a person", help: "Off: the 'talk to a human' route refuses new conversations." },

  // ---- Learning
];

export const SETTING_BY_KEY: Record<string, SettingDef> = Object.fromEntries(SETTING_DEFS.map((d) => [d.key, d]));

export function storageKeyOf(def: SettingDef): string {
  return def.storageKey ?? `setting:${def.key}`;
}

/** Turns stored text into a typed value, falling back to the default when it is missing or out of range. */
export function parseSetting(def: SettingDef, raw: string | undefined): SettingValue {
  if (raw === undefined) return def.default;
  if (def.type === "toggle") return raw === "1";
  if (def.type === "number") {
    const n = Number(raw);
    return Number.isFinite(n) && n >= def.min && n <= def.max ? n : def.default;
  }
  return raw.slice(0, def.maxLength);
}

export function serializeSetting(def: SettingDef, value: unknown): string {
  if (def.type === "toggle") return value === true ? "1" : "0";
  if (def.type === "number") {
    const n = Number(value);
    if (!Number.isFinite(n) || n < def.min || n > def.max) throw new Error(`${def.label} must be between ${def.min} and ${def.max}.`);
    return String(Math.round(n));
  }
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${def.label} cannot be empty.`);
  if (text.length > def.maxLength) throw new Error(`${def.label} can be ${def.maxLength} characters at most.`);
  return text;
}

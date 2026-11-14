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
  /** True when saving nothing is fine (the setting is a list that can be empty). */
  allowEmpty?: boolean;
  /** When set, a saved value must match this. `patternHint` is the message shown when it does not. */
  pattern?: RegExp;
  patternHint?: string;
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
  { id: "atom", label: "Atom and support", blurb: "The assistant and the human handoff." },
] as const;
export type SettingCategory = (typeof SETTING_CATEGORIES)[number]["id"];

export const SETTING_DEFS: SettingDef[] = [
  // ---- Booking
  { key: "booking.paused", category: "booking", type: "toggle", default: false, label: "Pause all new bookings", help: "Students cannot book any class while this is on. Existing bookings are untouched." },
  { key: "booking.requestMode", category: "booking", type: "toggle", default: false, label: "Students request times, I confirm", help: "On: students cannot book by themselves. They send a request, and you confirm or decline it in Schedule, Requests. The earliest request for a time is first in line. Off: students book their own times." },
  { key: "booking.emailOwnerOnRequest", category: "booking", type: "toggle", default: true, label: "Email me each new request", help: "Only when students request times: an email to you (the owner) for every new request." },
  { key: "booking.pausedMessage", category: "booking", type: "text", default: "Booking is paused for now. Please check back soon.", maxLength: 200, label: "Message shown while paused", help: "What a student sees when they try to book during a pause." },
  { key: "booking.allowSameDay", category: "booking", type: "toggle", default: true, label: "Allow same-day booking", help: "Off: a class can only be booked for a later calendar day (US Eastern)." },
  { key: "booking.minNoticeHours", category: "booking", type: "number", default: 0, min: 0, max: 168, unit: "hours", label: "Minimum notice to book", help: "A class must start at least this many hours from now. 0 means no minimum." },
  { key: "booking.horizonWeeks", category: "booking", type: "number", default: 8, min: 1, max: 12, unit: "weeks", label: "How far ahead students can book", help: "How many upcoming weeks of each weekly slot are offered." },
  { key: "booking.perHourLimit", category: "booking", type: "number", default: 20, min: 1, max: 100, unit: "per hour", label: "Booking attempts per student per hour", help: "Stops a script from hammering the booking screen." },
  { key: "booking.allowFamily", category: "booking", type: "toggle", default: true, label: "Allow family bookings", help: "Off: only one-student bookings can be made." },
  { key: "booking.notifyAdminOnBooking", category: "booking", type: "toggle", default: true, label: "Tell admins when a student books", help: "Sends the in-app and email notice for each new booking." },

  // ---- Cancel and reschedule
  { key: "cancel.studentCanCancel", category: "cancellation", type: "toggle", default: true, label: "Students can cancel their own classes", help: "Off: students must message you to cancel." },
  { key: "cancel.cutoffHours", category: "cancellation", type: "number", default: 6, min: 0, max: 168, unit: "hours", label: "Cancel and reschedule cutoff", help: "A student can cancel or move a class only if it is at least this far away. The app and Atom follow this number. The FAQ and Terms pages say 6 hours in fixed text, so change them too if you change this." },
  { key: "cancel.studentCanReschedule", category: "cancellation", type: "toggle", default: true, label: "Students can reschedule their own classes", help: "Off: students must message you to move a class." },

  // ---- Trial and access
  { key: "trial.enabled", category: "trial", type: "toggle", default: true, label: "Free trial for new students", help: "On: every new account starts with the free trial (once per person). Off: new accounts get none; you can still give one from a student's page." },
  { key: "trial.days", category: "trial", type: "number", default: 3, min: 1, max: 30, unit: "days", label: "Trial length", help: "How long a new trial lasts. The app and Atom follow this number; the public Terms and FAQ pages still say 3 days." },
  { key: "trial.lessonCount", category: "trial", type: "number", default: 3, min: 1, max: 20, unit: "lessons", label: "Lessons open during the trial", help: "How many of Scale 1's first lessons a trial student can open." },
  { key: "access.planGraceDays", category: "trial", type: "number", default: 3, min: 0, max: 30, unit: "days", label: "Grace period after a plan's paid cycle", help: "Curriculum access continues this long after the paid period ends." },
  { key: "access.scaleUnlockIntervalDays", category: "trial", type: "number", default: 7, min: 0, max: 60, unit: "days", label: "Days between scale unlocks", help: "A student becomes eligible for the next scale this long after the last unlock." },
  { key: "access.autoApproveScales", category: "trial", type: "toggle", default: false, storageKey: "auto_approve_scales", label: "Release the next scale automatically", help: "When a student is ready, skip your approval click." },

  // ---- Sign-up
  { key: "signup.open", category: "signup", type: "toggle", default: true, label: "Allow new sign-ups", help: "Off: the register form refuses new accounts. Existing students are unaffected." },
  { key: "signup.closedMessage", category: "signup", type: "text", default: "New sign-ups are closed right now. Please check back soon.", maxLength: 200, label: "Message shown when sign-ups are closed", help: "What a visitor sees when they try to register." },
  { key: "signup.requireFullName", category: "signup", type: "toggle", default: true, label: "Require first and last name", help: "Off: a single name is accepted at sign-up." },
  { key: "phone.askAtSignup", category: "phone", type: "toggle", default: true, label: "Ask for a phone number at sign-up", help: "New students must enter a real number to create an account. It is checked for realness and cannot be a number another account already has, but it is not proven theirs; payments only use it as an extra clue." },
  { key: "phone.verifyBySms", category: "phone", type: "toggle", default: false, label: "Confirm numbers with a 6-digit text", help: "Off: numbers are kept as typed. On: new accounts must confirm theirs by text before using the app. Needs a text-message service set up on the server (Plivo keys), so it costs money per text." },
  { key: "signup.blockDisposable", category: "signup", type: "toggle", default: true, label: "Block throwaway email addresses", help: "Refuses sign-ups from disposable email domains." },

  { key: "phone.promptExisting", category: "phone", type: "toggle", default: true, label: "Ask existing students for a phone number", help: "Shows a short banner at the top of the screen, at most once a day, to anyone who has no number on file (or none confirmed, when text confirmation is on). They are never locked out." },
  { key: "phone.promptSeconds", category: "phone", type: "number", default: 8, min: 3, max: 30, unit: "seconds", label: "How long the phone banner stays", help: "It slides down from the top, stays this long, then slides away by itself." },

  // ---- Security
  { key: "security.loginMaxAttempts", category: "security", type: "number", default: 8, min: 3, max: 50, unit: "tries", label: "Wrong passwords before a lockout", help: "Counted per account over the window below." },
  { key: "security.loginLockoutMinutes", category: "security", type: "number", default: 15, min: 1, max: 240, unit: "minutes", label: "Sign-in lockout window", help: "How long wrong passwords are counted, and how long a lockout lasts." },
  { key: "security.failedLoginAlertThreshold", category: "security", type: "number", default: 30, min: 0, max: 1000, unit: "tries", label: "Failed sign-ins in an hour that alert you", help: "Across the whole site. You are told at most once an hour. 0 turns the alert off." },
  { key: "security.codeExpiryMinutes", category: "security", type: "number", default: 10, min: 2, max: 60, unit: "minutes", label: "Emailed code lifetime", help: "How long a 6-digit code works." },
  { key: "security.maxCodeAttempts", category: "security", type: "number", default: 5, min: 1, max: 20, unit: "tries", label: "Wrong tries per code", help: "A code is canceled after this many wrong entries." },
  { key: "security.codeIssueLimit", category: "security", type: "number", default: 5, min: 1, max: 30, unit: "codes", label: "Codes that can be requested per window", help: "Per email address and purpose." },
  { key: "security.codeIssueWindowMinutes", category: "security", type: "number", default: 15, min: 1, max: 120, unit: "minutes", label: "Code request window", help: "The window that the limit above counts over." },

  // ---- Reminders and alerts
  { key: "reminders.classDayBefore", category: "reminders", type: "toggle", default: true, label: "Remind students the day before class", help: "The 'Your class is tomorrow' notice." },
  { key: "reminders.classHourBefore", category: "reminders", type: "toggle", default: true, label: "Remind students shortly before class", help: "The 'Your class starts soon' notice." },
  { key: "reminders.practiceEnabled", category: "reminders", type: "toggle", default: true, label: "Practice reminders", help: "Nudges students who have stopped practicing (bell and email), and the practice banner at the top of the screen. A student who turned practice reminders off for themselves gets none of them." },
  { key: "reminders.practiceDays", category: "reminders", type: "text", default: "1,3,7,14,30", maxLength: 40, pattern: /^\d{1,3}(\s*,\s*\d{1,3})*$/, patternHint: "Use whole numbers separated by commas, such as 1,3,7,14,30.", label: "Days of silence that trigger a practice reminder", help: "Comma-separated, such as 1,3,7,14,30." },
  { key: "reminders.creditExpiryWarningDays", category: "reminders", type: "number", default: 5, min: 1, max: 30, unit: "days", label: "Warn before credits expire", help: "How many days ahead a student is told their credits are about to expire." },
  { key: "practice.promptSeconds", category: "reminders", type: "number", default: 10, min: 3, max: 30, unit: "seconds", label: "How long the practice banner stays", help: "Then it slides away by itself." },
  { key: "practice.promptRepeatMinutes", category: "reminders", type: "number", default: 60, min: 5, max: 1440, unit: "minutes", label: "Show the practice banner again after", help: "If it is ignored or closed, it comes back this many minutes later while they are still on the site and have not practiced." },
  { key: "reminders.adminDailySummary", category: "reminders", type: "toggle", default: true, label: "Morning summary email to you", help: "The daily owner email." },

  // ---- Discord
  { key: "discord.enabled", category: "discord", type: "toggle", default: true, label: "Create Discord class calls", help: "Off: no private call is opened for any class." },
  { key: "discord.openBeforeMinutes", category: "discord", type: "number", default: 5, min: 1, max: 60, unit: "minutes", label: "Open the call this long before class", help: "The channel appears this many minutes ahead." },
  { key: "discord.closeAfterMinutes", category: "discord", type: "number", default: 5, min: 0, max: 120, unit: "minutes", label: "Keep the call open after class ends", help: "The channel is removed this long after the class finishes." },
  { key: "discord.addOwner", category: "discord", type: "toggle", default: true, label: "Add me to every class call", help: "Gives your connected Discord account access to each call." },
  { key: "discord.notifyOwner", category: "discord", type: "toggle", default: true, label: "Notify me with a join link when a call opens", help: "An in-app notice with a link straight to the call." },
  { key: "discord.notifyStudents", category: "discord", type: "toggle", default: true, label: "Notify students when their call opens", help: "The 'Your class call is open' notice with a join link." },
  { key: "discord.autoMove", category: "discord", type: "toggle", default: true, label: "Move people into the call if they are already in a voice channel", help: "Discord only lets the bot move someone who is already connected to a voice channel. The bot checks every minute from when the call opens until 15 minutes after class starts, and moves each person within a minute of them joining voice." },
  { key: "discord.promptEnabled", category: "discord", type: "toggle", default: true, label: "Remind students to connect Discord", help: "A banner at the top of the screen for anyone who has not connected Discord. It stops for good once they connect." },
  { key: "discord.promptSeconds", category: "discord", type: "number", default: 8, min: 3, max: 30, unit: "seconds", label: "How long the Discord banner stays", help: "Then it slides away by itself." },
  { key: "discord.promptRepeatMinutes", category: "discord", type: "number", default: 10, min: 1, max: 1440, unit: "minutes", label: "Show the Discord banner again after", help: "If it is ignored or closed, it comes back this many minutes later while they are still on the site." },
  { key: "discord.testChannelMinutes", category: "discord", type: "number", default: 10, min: 1, max: 60, unit: "minutes", label: "How long the test call stays", help: "For the test button on the Lessons page." },

  // ---- Payments
  { key: "payments.installmentLeadDays", category: "payments", type: "number", default: 7, min: 0, max: 30, unit: "days", label: "Open an installment this early", help: "How many days before the due date the next installment can be paid." },
  { key: "payments.emailAutoApprove", category: "payments", type: "toggle", default: true, label: "Approve payments from matching bank emails", help: "Off: receipts are still kept, but every payment waits for you to approve it." },
  { key: "payments.amountMismatchNotice", category: "payments", type: "toggle", default: true, label: "Tell a student when their payment amount is wrong", help: "The notice sent when the money arrives under their name for a different amount." },
  { key: "payments.matchByAmount", category: "payments", type: "toggle", default: true, label: "Clear a payment by its exact amount when only one is open", help: "When nothing else matches (no code, name or phone) but exactly one recent payment is open for that exact amount, and the sender is not a known person on another account, it is approved and left in your unchecked list. Off: those wait for you." },
  { key: "payments.fifthClassPriceDollars", category: "payments", type: "number", default: 55, min: 0, max: 200, unit: "dollars", label: "Fifth class price (retired)", help: "Billing cycles are 28 days, so a cycle never holds a fifth class and this price is no longer used." },
  { key: "pricing.monthlyPlanDollars", category: "payments", type: "number", default: 220, min: 20, max: 2000, unit: "dollars", label: "1 Month plan price", help: "The price of the 45 minute a week plan before any term discount. It is shown and charged as just under the next $5 ($220 shows as $219.99). Changing it prices new plans and plan changes only: everyone already on a plan keeps the price they signed up at. Edit this with a live preview on Admin > Pricing." },
  { key: "pricing.term3DiscountPercent", category: "payments", type: "number", default: 10, min: 0, max: 60, unit: "percent", label: "3 month plan discount", help: "Percent off the 1 month price for an 84-day plan. New plans only." },
  { key: "pricing.term6DiscountPercent", category: "payments", type: "number", default: 20, min: 0, max: 70, unit: "percent", label: "6 month plan discount", help: "Percent off the 1 month price for a 168-day plan. New plans only." },
  { key: "pricing.familyDiscountPercent", category: "payments", type: "number", default: 10, min: 0, max: 50, unit: "percent", label: "Group plan extra discount", help: "The extra percent off, per student, on a group plan. New group plans only." },
  { key: "pricing.extraClassPriceDollars", category: "payments", type: "number", default: 55, min: 1, max: 500, unit: "dollars", label: "Price of an extra class", help: "What one extra 45 minute class costs, for extra time on top of a weekly class and for people without a plan." },
  { key: "payments.askPhone", category: "payments", type: "toggle", default: false, label: "Ask for a phone number when someone pays", help: "The payment sheet asks for the phone number they pay from, before showing the payment code, and it must match the number on their own account (green check). Off by default: SoFi and Bank of America emails do not show a sender phone, so it does not help match payments." },
  { key: "payments.ignoreSenderNames", category: "payments", type: "text", default: "", allowEmpty: true, maxLength: 300, label: "Names to ignore in bank emails", help: "Your own transfers between your accounts, so they stop showing up as unmatched payments. Full names (first and last) separated by commas. An email from exactly one of these names is skipped, unless its note carries a payment code. You can also add a name with \"Always ignore\" on an unmatched email." },
  { key: "payments.firstBillLapseDays", category: "payments", type: "number", default: 2, min: 1, max: 14, unit: "days", label: "Release a new plan's weekly time if its first payment has not arrived after", help: "A plan holds its weekly time for the student the moment it is created. If nothing has been paid by then, the plan is canceled and the time is open to others again, so an unpaid plan cannot sit on a popular slot." },
  { key: "attendance.autoChargeHours", category: "payments", type: "number", default: 48, min: 0, max: 240, unit: "hours", label: "Charge a class nobody marked, this long after it started", help: "A class that is still not marked Present or No-show this many hours after it started is charged as attended, so an unmarked class is never free. You get an alert about a day before. Set 0 to turn it off." },
  { key: "family.changeCooldownDays", category: "payments", type: "number", default: 60, min: 0, max: 365, unit: "days", label: "Days between group plan changes", help: "After someone starts or switches into a group plan, they cannot start another group plan for this long. Stops switching in and out for the discount. 0 turns it off." },
  { key: "payments.lapseAfterDays", category: "payments", type: "number", default: 7, min: 1, max: 60, unit: "days", label: "Cancel an unpaid plan after", help: "A plan this many days past due with nothing in review is canceled." },

  // ---- Atom and support
  { key: "atom.enabled", category: "atom", type: "toggle", default: true, label: "Atom answers questions", help: "Off: Atom says it is unavailable and offers the human handoff." },
  { key: "atom.maxConversationMessages", category: "atom", type: "number", default: 20, min: 4, max: 40, unit: "messages", label: "Conversation memory", help: "How many recent messages Atom reads for each answer. Fewer is cheaper." },
  { key: "atom.handoffEnabled", category: "atom", type: "toggle", default: true, label: "Allow handoff to a person", help: "Off: the 'talk to a human' route refuses new conversations." },

  // ---- Learning
];

/**
 * The definitions as the browser may receive them. A RegExp cannot cross from a server page to a client
 * component (Next refuses to render the page), and the browser never checks it: the server does, on save.
 */
export const CLIENT_SETTING_DEFS: SettingDef[] = SETTING_DEFS.map((d) => {
  const { pattern: _pattern, ...rest } = d as SettingDef & { pattern?: RegExp };
  return rest as SettingDef;
});

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
  if (!text && !def.allowEmpty) throw new Error(`${def.label} cannot be empty.`);
  if (text.length > def.maxLength) throw new Error(`${def.label} can be ${def.maxLength} characters at most.`);
  if (def.pattern && !def.pattern.test(text)) throw new Error(def.patternHint ?? `${def.label} is not in the right format.`);
  return text;
}

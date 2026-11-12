// The list of admin alerts and how they are grouped. Kept free of imports so
// client components can use it without pulling in server code.

export const ADMIN_NOTIFICATION_GROUPS = ["People", "Payments", "Classes", "Messages"] as const;
export type AdminNotificationGroup = (typeof ADMIN_NOTIFICATION_GROUPS)[number];

/** ownerOnly kinds never reach employees; the owner can still switch them off for themselves. */
export const ADMIN_NOTIFICATION_KINDS = [
  { kind: "NEW_ACCOUNT", label: "New account created, not verified yet", group: "People", defaultOn: false, ownerOnly: true },
  { kind: "ACCOUNT_VERIFIED", label: "New account verified", group: "People", defaultOn: false, ownerOnly: true },
  { kind: "ACCOUNT_DELETED", label: "A student deleted their account while classes were booked", group: "People", defaultOn: true, ownerOnly: false },
  { kind: "FAILED_LOGIN_SPIKE", label: "Many failed sign-in attempts in an hour", group: "People", defaultOn: false, ownerOnly: true },
  { kind: "ACCOUNT_BANNED", label: "An account was banned or a ban was lifted", group: "People", defaultOn: true, ownerOnly: false },
  { kind: "EMAIL_BOUNCED", label: "An email to a student bounced (the address may be mistyped)", group: "People", defaultOn: true, ownerOnly: false },
  { kind: "NEW_REGISTRATION", label: "Someone sent the class form", group: "People", defaultOn: true, ownerOnly: false },
  { kind: "NEW_SUBSCRIPTION", label: "New subscription and weekly time", group: "Payments", defaultOn: true, ownerOnly: false },
  { kind: "PAYMENT_REVIEW", label: "Payment to review", group: "Payments", defaultOn: true, ownerOnly: false },
  { kind: "PAYMENT_EMAIL_REJECTED", label: "A forwarded bank email failed its sender check and was ignored", group: "Payments", defaultOn: true, ownerOnly: false },
  { kind: "PAYMENT_EMAIL_UNREADABLE", label: "A bank email that looks like a payment could not be read", group: "Payments", defaultOn: true, ownerOnly: false },
  { kind: "PAYMENT_REVERSED", label: "A payment may have been taken back", group: "Payments", defaultOn: true, ownerOnly: false },
  { kind: "PAYMENT_AUTO_APPROVED", label: "Payment approved automatically", group: "Payments", defaultOn: false, ownerOnly: false },
  { kind: "RECEIPT_COPY", label: "A copy of every payment receipt, by email", group: "Payments", defaultOn: true, ownerOnly: true },
  { kind: "PLAN_CANCEL_FEEDBACK", label: "Student canceled their plan", group: "Payments", defaultOn: true, ownerOnly: false },
  { kind: "PLAN_LAPSED", label: "Plan canceled for non-payment", group: "Payments", defaultOn: false, ownerOnly: false },
  { kind: "NEW_BOOKING", label: "New class booking", group: "Classes", defaultOn: true, ownerOnly: false },
  { kind: "SLOT_PROBLEM", label: "A subscriber's weekly time no longer exists", group: "Classes", defaultOn: true, ownerOnly: false },
  { kind: "UNMARKED_CLASSES", label: "Classes nobody marked are about to be charged automatically", group: "Classes", defaultOn: false, ownerOnly: false },
  { kind: "SUPPORT_CHAT", label: "Support Chat handoffs and messages", group: "Messages", defaultOn: true, ownerOnly: false },
  { kind: "OWNER_MESSAGES", label: "Messages sent to the owner account", group: "Messages", defaultOn: false, ownerOnly: false },
  { kind: "MUSIC_INBOX", label: "New emails to music@bassnotepiano.com (Support Chat, Email tab)", group: "Messages", defaultOn: true, ownerOnly: false },
] as const;

export type AdminNotificationKind = (typeof ADMIN_NOTIFICATION_KINDS)[number]["kind"];


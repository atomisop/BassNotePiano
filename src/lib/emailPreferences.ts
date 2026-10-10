// The "also email me" switches under Settings > Notification settings, and which kind of notice each one governs. One place, so
// the screen, the emails and the in-app banners can never disagree about what a switch means. Pure, so it is unit tested.

export type EmailCategory = "payments" | "roleUpdates" | "social" | "reminders" | "classes";

export interface EmailPrefs {
  notifyEmailPayments: boolean;
  notifyEmailRoleUpdates: boolean;
  notifyEmailSocial: boolean;
  notifyEmailReminders: boolean;
  notifyEmailClasses: boolean;
}

export const PREFERENCE_COLUMN: Record<EmailCategory, keyof EmailPrefs> = {
  payments: "notifyEmailPayments",
  roleUpdates: "notifyEmailRoleUpdates",
  social: "notifyEmailSocial",
  reminders: "notifyEmailReminders",
  classes: "notifyEmailClasses",
};

export const EMAIL_PREF_SELECT = {
  email: true,
  notifyEmailPayments: true,
  notifyEmailRoleUpdates: true,
  notifyEmailSocial: true,
  notifyEmailReminders: true,
  notifyEmailClasses: true,
  bannedAt: true,
} as const;

export function isEmailEnabled(prefs: EmailPrefs, category: EmailCategory): boolean {
  return prefs[PREFERENCE_COLUMN[category]];
}

/**
 * Practice reminders (the switch labelled that way) also decide the practice banner at the top of the screen: it shows only when
 * the owner has practice reminders on in Settings AND the person has not turned them off for themselves.
 */
export function practiceBannerAllowed(input: { ownerEnabled: boolean; prefs: Pick<EmailPrefs, "notifyEmailReminders"> }): boolean {
  return input.ownerEnabled && input.prefs.notifyEmailReminders;
}

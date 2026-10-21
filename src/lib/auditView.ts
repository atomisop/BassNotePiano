/** Plain words for the audit log's short action codes (anything not listed shows as its code). */
const LABELS: Record<string, string> = {
  "user.ban": "Banned an account",
  "user.unban": "Lifted a ban",
  "user.role": "Changed a role",
  "setting.set": "Changed a setting",
  "setting.reset": "Reset a setting",
  "plan.cancel": "Canceled a plan",
  "plan.pause": "Paused a plan",
  "calendar.reset": "Made a new calendar link",
  "referral.reward": "Paid out a referral reward",
  "payment.refund": "Refunded a payment",
  "payment.delete": "Deleted a payment",
  "payment.match_email": "Matched a bank email by hand",
  "payment.ignore_sender": "Ignored a bank email sender",
  "payment.forget_payer_name": "Forgot a payer name",
  "payment.dismiss_email": "Dismissed a bank email",
  "credits.grant": "Gave credits",
  "credits.revoke": "Took credits away",
  "discord.notify": "Sent a Discord reminder",
  "discord.disconnect": "Disconnected Discord",
  "automation.set": "Changed an automatic approval",
  "followup.reminder": "Sent a follow-up reminder",
  "email.unsubscribe": "Unsubscribed from emails",
  "pricing.update": "Changed plan prices",
  "pricing.discount.set": "Gave or changed a discount",
  "pricing.discount.clear": "Removed a discount",
  "security.csp.clear": "Cleared security reports",
};

export function auditLabel(action: string): string {
  return LABELS[action] ?? action;
}

/** The part before the first dot, for the "kind of change" filter ("payment", "user", "pricing"). */
export function auditKind(action: string): string {
  return action.split(".")[0] ?? action;
}

export const AUDIT_KIND_LABEL: Record<string, string> = {
  user: "Accounts",
  setting: "Settings",
  plan: "Plans",
  payment: "Payments",
  credits: "Credits",
  discord: "Discord",
  automation: "Automatic approvals",
  followup: "Follow-ups",
  email: "Email",
  pricing: "Pricing",
  security: "Security",
};

export const AUDIT_PAGE_SIZE = 50;

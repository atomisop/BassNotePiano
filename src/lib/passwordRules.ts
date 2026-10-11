// The one definition of what a password must contain, used by the sign-up, reset and change-password screens (which show it
// live while typing) and by the servers behind them (which enforce it). Only NEW passwords are held to it; nobody is locked out
// of an account whose older password is shorter or plainer. Pure, so it is unit tested.

export const MIN_PASSWORD_LENGTH = 8;

const SYMBOL = /[!-/:-@[-`{-~]/;
const COMMON = /^(?:password|passw0rd|qwerty|letmein|welcome|admin|iloveyou|monkey|dragon|abc123|111111|123123|123456)/i;
const RUN = /(.)\1{3,}/;
const RUN_UP = /(?:0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|defg|qwer|wert|erty|asdf)/i;

export interface PasswordRule {
  id: string;
  label: string;
  /** A password that fails a required rule is refused. The others only make the strength bar fuller. */
  required: boolean;
  test: (value: string) => boolean;
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: "length", label: `At least ${MIN_PASSWORD_LENGTH} characters`, required: true, test: (v) => v.length >= MIN_PASSWORD_LENGTH },
  { id: "symbol", label: "A special character, such as ! ? # $", required: true, test: (v) => SYMBOL.test(v) },
  { id: "case", label: "Upper and lower case letters (stronger)", required: false, test: (v) => /[a-z]/.test(v) && /[A-Z]/.test(v) },
  { id: "digit", label: "A number (stronger)", required: false, test: (v) => /\d/.test(v) },
];

/** True for passwords everyone tries first: common words, long runs of one character, keyboard or number sequences. */
export function isGuessablePassword(value: string): boolean {
  return value.length > 0 && (COMMON.test(value) || RUN.test(value) || RUN_UP.test(value));
}

/** 0 when empty, 1 for a guessable one, otherwise how many rules are met (at least 1). */
export function passwordScore(value: string, rules: readonly PasswordRule[] = PASSWORD_RULES): number {
  if (value.length === 0) return 0;
  if (isGuessablePassword(value)) return 1;
  const passed = rules.reduce((n, rule) => n + (rule.test(value) ? 1 : 0), 0);
  return Math.min(rules.length, Math.max(1, passed));
}

/** The message for a new password that is not allowed, or null when it is. The servers use this too. */
export function passwordRequirementError(value: string): string | null {
  const missing = PASSWORD_RULES.filter((rule) => rule.required && !rule.test(value));
  if (missing.length === 0) return null;
  return `Your password needs ${missing.map((rule) => rule.label.charAt(0).toLowerCase() + rule.label.slice(1)).join(" and ")}.`;
}

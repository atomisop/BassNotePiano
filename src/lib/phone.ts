// Phone numbers, kept as E.164 text such as "+15551234567". No imports, so forms and server code share it.

/**
 * Turns what a person typed into E.164, or null when it cannot be a real number.
 * A number without a "+" is read as US or Canadian (10 digits, or 11 starting with 1), since that is who
 * the studio teaches; anyone elsewhere types the "+" and country code.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!/^[+\d\s().-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");

  if (trimmed.startsWith("+")) {
    if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) return null;
    // +1 numbers must be 11 digits with a real area code (2 to 9 first).
    if (digits.startsWith("1") && !/^1[2-9]\d{9}$/.test(digits)) return null;
    return `+${digits}`;
  }

  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(national)) return null;
  return `+1${national}`;
}

/** "+15551234567" shown as "(555) 123-4567"; anything else is shown as stored. */
export function formatPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

/** Only the last four digits, for places that should not show the whole number. */
export function maskPhone(e164: string): string {
  return `•••• ${e164.slice(-4)}`;
}

export const PHONE_HELP = "US and Canada numbers work as typed. Anywhere else, start with + and your country code.";

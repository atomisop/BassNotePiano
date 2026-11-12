// Bank and Venmo emails name the sender in full, and payments are matched to a
// student by that name, so an account needs a first and a last name. Pure, so it is tested.

/** At least two words, each with something other than digits and punctuation (any alphabet counts). */
export function hasFirstAndLastName(name: string | null | undefined): boolean {
  const words = (name ?? "").trim().split(/\s+/).filter((word) => /[^\d!-\/:-@[-`{-~]/.test(word));
  return words.length >= 2;
}

/** The longest name an account may have. Checked where a name is accepted, so everything built from it (the pending sign-up included) can rely on it. */
export const MAX_PERSON_NAME_LENGTH = 120;

export const FULL_NAME_MESSAGE = "Enter your first and last name, the way it appears on your bank or Venmo account.";

/** A name as it is stored: no control characters (a carriage return or line break inside a name can break files built from it, such as the calendar feed), single spaces, trimmed. */
export function cleanPersonName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
}

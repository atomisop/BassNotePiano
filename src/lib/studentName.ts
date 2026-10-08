// Bank and Venmo emails name the sender in full, and payments are matched to a
// student by that name, so an account needs a first and a last name. Pure, so it is tested.

/** At least two words, each with something other than digits and punctuation (any alphabet counts). */
export function hasFirstAndLastName(name: string | null | undefined): boolean {
  const words = (name ?? "").trim().split(/\s+/).filter((word) => /[^\d!-\/:-@[-`{-~]/.test(word));
  return words.length >= 2;
}

export const FULL_NAME_MESSAGE = "Enter your first and last name, the way it appears on your bank or Venmo account.";

/**
 * A 6-digit code shown as two groups of three ("482 913"), so it can be read and checked against the email or text in two short
 * chunks instead of one run of six. Only the display is split: every field keeps the digits alone in its state (each onChange
 * strips anything that is not a digit), so what is sent never contains the space.
 */
export function chunkCode(digits: string): string {
  return digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
}

/** Room for six digits and the one space between the groups. */
export const CHUNKED_CODE_LENGTH = 7;

import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { normalizePhone } from "@/lib/phone";

// Server side only: the number metadata is large, so forms use the light check in phone.ts for instant feedback
// and this one runs when a number is actually saved.

export type PhoneAssessment = { ok: true; phone: string } | { ok: false; error: string };

const NOT_REAL = "That doesn't look like a real phone number. Check the area code and the digits.";

/**
 * Whether a typed number could really exist: it must parse, match the numbering plan of its country (real area
 * codes, right length), and not be an obvious filler such as 5555555555, 1234567890 or a 555-01xx movie number.
 * This does NOT prove the line is active or that it belongs to the person; only a text code (or a paid line
 * lookup) can say that.
 */
export function assessPhone(input: string): PhoneAssessment {
  const e164 = normalizePhone(input);
  if (!e164) return { ok: false, error: "That doesn't look like a phone number. US and Canada numbers work as typed; anywhere else, start with + and your country code." };

  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed || !parsed.isValid()) return { ok: false, error: NOT_REAL };

  const national = parsed.nationalNumber;
  if (/^(\d)\1+$/.test(national)) return { ok: false, error: NOT_REAL };
  if (["1234567890", "0123456789", "9876543210", "0987654321"].includes(national)) return { ok: false, error: NOT_REAL };
  // 555-0100 to 555-0199 are reserved for fiction in North America.
  if (parsed.countryCallingCode === "1" && national.slice(3, 6) === "555" && /^01\d\d$/.test(national.slice(6))) return { ok: false, error: NOT_REAL };

  return { ok: true, phone: parsed.number };
}

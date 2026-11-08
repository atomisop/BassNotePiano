import type { PrimaryInstrument } from "@prisma/client";
import { INSTRUMENTS_COMING_SOON } from "@/lib/classRegistrationLabels";

/** The instrument a visitor picked on the marketing page, carried through sign-up into setup. */
export const INSTRUMENT_INTENT_KEY = "bnp-instrument-intent";

const BY_SLUG: Record<string, PrimaryInstrument> = {
  piano: "PIANO_KEYBOARD",
  guitar: "GUITAR",
  bass: "BASS",
};

/**
 * Turns the `?instrument=` value into a real instrument, or null.
 * Only slugs we teach are accepted, and an instrument marked coming soon never pre-selects.
 * Anything else (unknown text, an enum name, an array) is ignored, so a crafted link cannot force a value.
 */
export function parseInstrumentIntent(raw: unknown): PrimaryInstrument | null {
  if (typeof raw !== "string") return null;
  const instrument = BY_SLUG[raw.trim().toLowerCase()];
  if (!instrument || INSTRUMENTS_COMING_SOON.has(instrument)) return null;
  return instrument;
}

export function instrumentSlug(instrument: PrimaryInstrument): string | null {
  const entry = Object.entries(BY_SLUG).find(([, value]) => value === instrument);
  return entry ? entry[0] : null;
}

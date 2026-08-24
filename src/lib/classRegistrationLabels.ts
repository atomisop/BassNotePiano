import type { PrimaryInstrument, SkillLevel } from "@prisma/client";

// Split out from classRegistration.ts on purpose — that module pulls in
// Prisma and the Resend email client, which must never end up in a "use
// client" bundle (StudentQueue.tsx imports these labels directly).
export const INSTRUMENT_LABEL: Record<PrimaryInstrument, string> = {
  PIANO_KEYBOARD: "Piano / Keyboard",
  BASS: "Bass",
  GUITAR: "Guitar",
  DRUMS: "Drums",
  VOCAL: "Vocal",
  OTHER: "Other",
};

export const SKILL_LABEL: Record<SkillLevel, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
};

/**
 * Instruments in the picker that the studio doesn't actually teach yet.
 * Still choosable everywhere PrimaryInstrument is picked (the class
 * registration form, onboarding, and the profile editor): someone
 * registering interest or setting this as their own instrument ahead of
 * launch is exactly the demand signal worth capturing, not something to
 * hide. Flagged "Coming soon" wherever it's offered as a choice instead, so
 * nobody picks it thinking lessons already exist.
 */
export const INSTRUMENTS_COMING_SOON = new Set<PrimaryInstrument>(["DRUMS", "VOCAL"]);

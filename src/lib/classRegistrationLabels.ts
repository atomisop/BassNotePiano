import type { PrimaryInstrument, SkillLevel } from "@prisma/client";

// Split out from classRegistration.ts on purpose, that module pulls in
// Prisma and the Resend email client, which must never end up in a "use
// client" bundle (ContactPanels.tsx imports these labels directly).
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
 * Flagged "Coming soon" and disabled everywhere PrimaryInstrument is picked
 * (the class registration form, onboarding, and the profile editor), so
 * nobody can pick a lesson that doesn't exist. An earlier version left these
 * clickable on purpose, to capture early interest as a demand signal, but a
 * "Coming soon" tag on something you could still click and select read as a
 * bug rather than a feature, so it was turned off.
 */
export const INSTRUMENTS_COMING_SOON = new Set<PrimaryInstrument>(["DRUMS", "VOCAL"]);

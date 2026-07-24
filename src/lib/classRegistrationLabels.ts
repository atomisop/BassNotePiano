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

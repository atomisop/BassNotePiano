import type { PrimaryInstrument } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { INSTRUMENT_LABEL, INSTRUMENTS_COMING_SOON } from "@/lib/classRegistrationLabels";

/**
 * The "tell me when it opens" list for instruments the studio does not teach yet (drums, vocal). A new student can tick them during
 * setup instead of being forced to pick an instrument that is not theirs; the ticks become an ordinary Contact with the
 * INTERESTED status, so the owner sees them on Admin > People with the instrument beside the name and needs no new screen.
 * This is not a way to pick the instrument: those stay switched off in every picker (see INSTRUMENTS_COMING_SOON).
 */
export const WAITLIST_SOURCE = "Sign-up: wants an instrument that is not open yet";

/** Only instruments that really are "coming soon", each once, whatever the browser sent. */
export function sanitizeWaitlist(input: unknown): PrimaryInstrument[] {
  if (!Array.isArray(input)) return [];
  const out: PrimaryInstrument[] = [];
  for (const value of input) {
    if (typeof value === "string" && INSTRUMENTS_COMING_SOON.has(value as PrimaryInstrument) && !out.includes(value as PrimaryInstrument)) out.push(value as PrimaryInstrument);
  }
  return out;
}

export function waitlistNote(wanted: PrimaryInstrument[]): string {
  return `Asked at sign-up to hear when ${wanted.map((i) => INSTRUMENT_LABEL[i]).join(" and ")} open.`;
}

/** Records the ticks for one account. Safe to run twice: it adds to an existing entry for the same email instead of making another. */
export async function recordInstrumentInterest(userId: string, wantedRaw: unknown): Promise<void> {
  const wanted = sanitizeWaitlist(wantedRaw);
  if (wanted.length === 0) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, phone: true, skillLevel: true } });
  if (!user) return;

  const note = waitlistNote(wanted);
  const existing = await prisma.contact.findFirst({ where: { email: { equals: user.email, mode: "insensitive" } }, select: { id: true, notes: true, instrument: true } });
  if (existing) {
    if ((existing.notes ?? "").includes(note)) return;
    await prisma.contact.update({
      where: { id: existing.id },
      data: { notes: existing.notes ? `${existing.notes}\n${note}` : note, ...(existing.instrument ? {} : { instrument: wanted[0] }) },
    });
    return;
  }
  await prisma.contact.create({
    data: {
      name: user.name?.trim() || user.email,
      email: user.email.toLowerCase(),
      phone: user.phone,
      instrument: wanted[0],
      skillLevel: user.skillLevel,
      source: WAITLIST_SOURCE,
      notes: note,
      status: "INTERESTED",
    },
  });
}

/** Removes the entry this feature made for an email when that person deletes their account. An entry the owner made by hand is never touched. */
export async function forgetInstrumentInterest(email: string): Promise<void> {
  await prisma.contact.deleteMany({ where: { email: { equals: email, mode: "insensitive" }, source: WAITLIST_SOURCE } });
}

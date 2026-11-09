import type { PrimaryInstrument, SkillLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAdminRecipients } from "@/lib/adminNotifications";
import { createNotification } from "@/lib/notifications";
import { sendNotificationEmail } from "@/lib/email";
import { getCurriculumEntitlement } from "@/lib/entitlement";
import { consumeRateLimit } from "@/lib/rateLimit";
import { savePhone } from "@/lib/phoneVerification";
import { INSTRUMENT_LABEL, INSTRUMENTS_COMING_SOON, SKILL_LABEL } from "@/lib/classRegistrationLabels";

/**
 * "Ask for a free trial class" from Home, signed in. The same application the public /classes form makes (a ClassRegistration row the
 * admin's Applicants list reads, approved the same way), but sent from the account: its own email, name and phone, so approving it always
 * starts the trial on this account. Only the instrument and level are asked when the account does not have them, plus the phone when
 * the account has none. No captcha (the account is the proof), one per person, and limited.
 */
export class TrialApplicationError extends Error {}

export const TRIAL_NOTE_MAX = 1000;

/** What Home needs to ask in place. Null when the account cannot apply (already has access, already applied, had its trial). */
export interface TrialApplyFacts {
  instrument: PrimaryInstrument | null;
  skillLevel: SkillLevel | null;
  hasPhone: boolean;
}

const usableInstrument = (value: PrimaryInstrument | null | undefined): PrimaryInstrument | null =>
  value && value in INSTRUMENT_LABEL && !INSTRUMENTS_COMING_SOON.has(value) ? value : null;

async function priorApplication(userId: string, email: string) {
  return prisma.classRegistration.findFirst({
    where: { OR: [{ userId }, { email: { equals: email, mode: "insensitive" } }] },
    orderBy: { createdAt: "desc" },
    select: { status: true },
  });
}

/** Whether this account can ask for a trial class from Home, and what is still missing for it. */
export async function getTrialApplyFacts(userId: string): Promise<TrialApplyFacts | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, role: true, bannedAt: true, trialEndsAt: true, phone: true, primaryInstrument: true, skillLevel: true },
  });
  if (!user || user.role !== "STUDENT" || user.bannedAt || user.trialEndsAt) return null;
  if (await priorApplication(userId, user.email)) return null;
  return { instrument: usableInstrument(user.primaryInstrument), skillLevel: user.skillLevel ?? null, hasPhone: Boolean(user.phone) };
}

export interface TrialApplyInput {
  instrument?: string | null;
  skillLevel?: string | null;
  phone?: string | null;
  note?: string | null;
}

/** Sends the application from the signed-in account. Throws TrialApplicationError (or a RateLimitError) with a plain reason. */
export async function submitSignedInApplication(userId: string, input: TrialApplyInput): Promise<{ id: string }> {
  await consumeRateLimit(prisma, `trial-apply:${userId}`, { windowMinutes: 24 * 60, max: 5, message: "Too many tries today. Please try again tomorrow." });
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, role: true, bannedAt: true, trialEndsAt: true, phone: true, primaryInstrument: true, skillLevel: true },
  });
  if (!user || user.role !== "STUDENT" || user.bannedAt) throw new TrialApplicationError("This account cannot ask for a trial class.");
  if (user.trialEndsAt) throw new TrialApplicationError("You already had your free trial. Choose a class plan to keep going.");
  if ((await getCurriculumEntitlement(userId)).kind !== "NONE") throw new TrialApplicationError("You already have lessons open. There is nothing to ask for.");
  const prior = await priorApplication(userId, user.email);
  if (prior?.status === "PENDING") throw new TrialApplicationError("We already have your request. We will be in touch soon.");
  if (prior) throw new TrialApplicationError("You already asked for a trial class. Send us a message if you would like to talk about it.");

  const instrument = usableInstrument((input.instrument as PrimaryInstrument | null) ?? user.primaryInstrument);
  if (!instrument) throw new TrialApplicationError("Pick the instrument you would like to learn.");
  const skillLevel = (input.skillLevel && input.skillLevel in SKILL_LABEL ? (input.skillLevel as SkillLevel) : null) ?? user.skillLevel;
  if (!skillLevel) throw new TrialApplicationError("Pick your level.");
  const note = input.note?.trim() ?? "";
  if (note.length > TRIAL_NOTE_MAX) throw new TrialApplicationError(`Please keep your note under ${TRIAL_NOTE_MAX} characters.`);

  // The account's own number. One typed here is checked and saved to the account (the same rules as Settings).
  let phone = user.phone;
  if (!phone) {
    const typed = input.phone?.trim() ?? "";
    if (!typed) throw new TrialApplicationError("Add a phone number so the studio can reach you.");
    const saved = await savePhone(userId, typed);
    if (!saved.ok) throw new TrialApplicationError(saved.error);
    phone = saved.phone;
  }

  const email = user.email.toLowerCase();
  const fullName = (user.name?.trim() || email.split("@")[0]).slice(0, 80);
  const registration = await prisma.classRegistration.create({
    data: { fullName, email, phone, instrument, skillLevel, notes: note || null, userId },
    select: { id: true },
  });
  // Remembered on the account too, when it did not have them yet (onboarding asks the same two things).
  if (!user.primaryInstrument || !user.skillLevel) {
    await prisma.user.update({ where: { id: userId }, data: { primaryInstrument: user.primaryInstrument ?? instrument, skillLevel: user.skillLevel ?? skillLevel } });
  }

  await sendNotificationEmail(
    email,
    "We've got your request",
    `Thanks, ${fullName.split(" ")[0]}. We've received your request for a free trial class in ${INSTRUMENT_LABEL[instrument]} (${SKILL_LABEL[skillLevel]}). We'll be in touch at ${email} or ${phone} soon.`,
  ).catch((err) => console.error("Trial request confirmation email failed (non-blocking):", err));

  const admins = await getAdminRecipients("NEW_REGISTRATION");
  await Promise.all(
    admins.map((admin) =>
      createNotification({
        userId: admin.id,
        type: "CLASS_REGISTRATION_RECEIVED",
        title: "New class registration",
        body: `${fullName} wants to learn ${INSTRUMENT_LABEL[instrument]} (${SKILL_LABEL[skillLevel]}). Sent from their account. Reach them at ${email} or ${phone}.`,
        emailCategory: "social",
      }).catch((err) => console.error("Registration notice to admin failed (non-blocking):", err)),
    ),
  );
  return registration;
}

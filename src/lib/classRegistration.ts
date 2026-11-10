import { getAdminRecipients } from "@/lib/adminNotifications";
import { getBoolSetting, getNumberSetting } from "@/lib/siteSettings";
import { logAudit } from "@/lib/audit";
import type { PrimaryInstrument, SkillLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { sendNotificationEmail, sendNotificationEmailWithCta } from "@/lib/email";
import { INSTRUMENT_LABEL, SKILL_LABEL } from "@/lib/classRegistrationLabels";
import { isDisposableEmailDomain } from "@/lib/disposableEmail";

export { INSTRUMENT_LABEL, SKILL_LABEL };

export interface SubmitClassRegistrationInput {
  fullName: string;
  email: string;
  phone: string;
  instrument: PrimaryInstrument;
  skillLevel: SkillLevel;
  notes?: string;
  userId?: string;
}

/**
 * Public lead-capture entry point, no account required. There is no review step (removed 2026-11-09): the details go to the
 * teacher, who reaches out outside the app, and the entry shows on Admin > People > Contacts until they make an account or the
 * teacher removes it. userId is filled when the submitter happens to be signed in.
 */
export async function submitClassRegistration(input: SubmitClassRegistrationInput) {
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  const notes = input.notes?.trim();

  if (!fullName) throw new Error("Full name is required.");
  // The form is public and its words are emailed to the typed address and to every admin: keep them short and plain.
  if (fullName.length > 80 || /[\r\n<>]|https?:|www\./i.test(fullName)) throw new Error("Enter your name without links or special characters.");
  if (notes && notes.length > 1000) throw new Error("Please keep your note under 1000 characters.");
  if (!(input.instrument in INSTRUMENT_LABEL) || !(input.skillLevel in SKILL_LABEL)) throw new Error("Pick an instrument and a level from the list.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  // Same check /api/auth/register runs, and for the same reason: this is
  // the only address the studio has to actually reach a registrant at to
  // get them scheduled, so a burner inbox defeats the form's entire
  // purpose even though no account is created here.
  if (isDisposableEmailDomain(email)) {
    throw new Error("That looks like a temporary or disposable email address. Please use one you can actually receive mail at.");
  }
  if (!phone) throw new Error("Phone number is required.");
  if (!/^[0-9+()\-.\s]{7,30}$/.test(phone)) throw new Error("Enter a valid phone number.");

  const registration = await prisma.classRegistration.create({
    data: {
      fullName,
      email,
      phone,
      instrument: input.instrument,
      skillLevel: input.skillLevel,
      notes: notes || null,
      userId: input.userId,
    },
  });

  // Confirms receipt to the address actually typed into the public form.
  // Deliberately never routed through userId/createNotification, a
  // submitter can be signed into a different account than the email
  // they're registering with (most commonly you, testing the form), and
  // that account's email must never silently swallow this.
  const confirmationTitle = "An instructor will reach out to you soon";
  const confirmationBody = `Thanks, ${fullName}. We've got your details for ${INSTRUMENT_LABEL[input.instrument]} lessons (${SKILL_LABEL[input.skillLevel]}). An instructor will reach out to you soon at ${email} or ${phone}.`;

  // No account uses this email yet: point them at making one, since every new account starts with the free trial.
  const existingAccount = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  const trialDays = (await getBoolSetting("trial.enabled")) ? await getNumberSetting("trial.days") : 0;
  if (existingAccount) {
    await sendNotificationEmail(email, confirmationTitle, confirmationBody).catch((err) =>
      console.error("Class registration confirmation email failed (non-blocking):", err),
    );
  } else {
    const registerUrl = `${process.env.NEXTAUTH_URL}/register?email=${encodeURIComponent(email)}`;
    await sendNotificationEmailWithCta(
      email,
      confirmationTitle,
      trialDays > 0
        ? `${confirmationBody} In the meantime, create an account and your ${trialDays}-day free trial of the first lessons starts right away.`
        : `${confirmationBody} In the meantime, you can create an account so everything's ready to go.`,
      { label: "Create your account", url: registerUrl },
    ).catch((err) => console.error("Class registration confirmation email failed (non-blocking):", err));
  }

  const admins = await getAdminRecipients("NEW_REGISTRATION");
  await Promise.all(
    admins.map((admin) =>
      createNotification({
        userId: admin.id,
        type: "CLASS_REGISTRATION_RECEIVED",
        title: "Someone wants classes",
        body: `${fullName} wants to learn ${INSTRUMENT_LABEL[input.instrument]} (${SKILL_LABEL[input.skillLevel]}). Reach them at ${email} or ${phone}.`,
        emailCategory: "social",
      }),
    ),
  );

  return registration;
}

/**
 * Takes one class form entry off the Contacts list (spam, or someone already dealt with). The row is deleted, not hidden: it only
 * held what the visitor typed, and keeping it after the teacher is done with it serves nobody.
 */
export async function removeClassRegistration(registrationId: string, adminId: string) {
  const row = await prisma.classRegistration.delete({ where: { id: registrationId }, select: { id: true, fullName: true } });
  await logAudit({ actorId: adminId, action: "registration.remove", targetType: "ClassRegistration", targetId: row.id, detail: `Removed the class form from ${row.fullName}` }).catch(() => undefined);
  return row;
}

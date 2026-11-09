import { getAdminRecipients } from "@/lib/adminNotifications";
import { startTrialForEmail } from "@/lib/entitlement";
import { getBoolSetting, getNumberSetting } from "@/lib/siteSettings";
import type { ClassRegistrationStatus, PrimaryInstrument, SkillLevel } from "@prisma/client";
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
 * Public lead-capture entry point, no account required. Fills userId
 * opportunistically when the submitter happens to be signed in, purely so
 * an approval can also raise an in-app Notification for them later.
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
  const confirmationTitle = "We've got your registration";
  const confirmationBody = `Thanks, ${fullName}. We've received your registration for ${INSTRUMENT_LABEL[input.instrument]} lessons (${SKILL_LABEL[input.skillLevel]}). We'll be in touch at ${email} or ${phone} soon.`;

  // No account uses this email yet, nudge them toward creating one while
  // the registration is reviewed, so they land somewhere real once it's
  // approved instead of just waiting on an email.
  const existingAccount = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingAccount) {
    await sendNotificationEmail(email, confirmationTitle, confirmationBody).catch((err) =>
      console.error("Class registration confirmation email failed (non-blocking):", err),
    );
  } else {
    const registerUrl = `${process.env.NEXTAUTH_URL}/register?email=${encodeURIComponent(email)}`;
    await sendNotificationEmailWithCta(
      email,
      confirmationTitle,
      `${confirmationBody} While we verify your registration, feel free to create an account so everything's ready to go.`,
      { label: "Create your account", url: registerUrl },
    ).catch((err) => console.error("Class registration confirmation email failed (non-blocking):", err));
  }

  const admins = await getAdminRecipients("NEW_REGISTRATION");
  await Promise.all(
    admins.map((admin) =>
      createNotification({
        userId: admin.id,
        type: "CLASS_REGISTRATION_RECEIVED",
        title: "New class registration",
        body: `${fullName} wants to learn ${INSTRUMENT_LABEL[input.instrument]} (${SKILL_LABEL[input.skillLevel]}). Reach them at ${email} or ${phone}.`,
        emailCategory: "social",
      }),
    ),
  );

  return registration;
}

export async function getAdminClassRegistrations(status?: ClassRegistrationStatus) {
  const rows = await prisma.classRegistration.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, name: true, image: true, username: true } },
      reviewedBy: { select: { name: true } },
    },
  });
  return withApplicantAccounts(rows);
}

export type AdminClassRegistration = Awaited<ReturnType<typeof getAdminClassRegistrations>>[number];

// ---------------------------------------------------------------------------
// Admin side: from applicant to student without leaving Applicants
// ---------------------------------------------------------------------------

const APPLICANT_ACCOUNT_SELECT = {
  id: true,
  name: true,
  email: true,
  username: true,
  image: true,
  role: true,
  bannedAt: true,
  _count: { select: { paymentPlans: { where: { status: "ACTIVE" as const } } } },
} as const;

/** The account an application belongs to, as the Applicants card shows it. */
export interface ApplicantAccount {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
  banned: boolean;
  /** A running plan already. */
  onPlan: boolean;
}

/**
 * Each application with the account it belongs to: the account with the application's email first (the address they typed), then the
 * account that was signed in when they applied (never an admin's, who is most often the owner testing the form). With no account yet,
 * when the studio (or anyone) last sent that address a sign-up link.
 */
async function withApplicantAccounts<T extends { email: string; user: { id: string } | null }>(
  rows: T[],
): Promise<(T & { account: ApplicantAccount | null; signUpLinkSentAt: Date | null })[]> {
  const { registerInvitesSentAt } = await import("@/lib/registerInvite");
  const emails = [...new Set(rows.map((r) => r.email.trim().toLowerCase()))];
  const linkedIds = [...new Set(rows.flatMap((r) => (r.user ? [r.user.id] : [])))];
  const [byEmailRows, linkedRows, invited] = await Promise.all([
    prisma.user.findMany({ where: { email: { in: emails, mode: "insensitive" } }, select: APPLICANT_ACCOUNT_SELECT }),
    prisma.user.findMany({ where: { id: { in: linkedIds } }, select: APPLICANT_ACCOUNT_SELECT }),
    registerInvitesSentAt(emails),
  ]);
  const byEmail = new Map(byEmailRows.map((u) => [u.email.toLowerCase(), u]));
  const byId = new Map(linkedRows.map((u) => [u.id, u]));
  return rows.map((r) => {
    const email = r.email.trim().toLowerCase();
    const linked = r.user ? byId.get(r.user.id) : undefined;
    const found = byEmail.get(email) ?? (linked && linked.role !== "ADMIN" ? linked : undefined);
    const account: ApplicantAccount | null = found
      ? { id: found.id, name: found.name, username: found.username, image: found.image, banned: found.bannedAt !== null, onPlan: found._count.paymentPlans > 0 }
      : null;
    return { ...r, account, signUpLinkSentAt: account ? null : (invited.get(email) ?? null) };
  });
}

/** The account to set up after approving an application, or null when they have not made one yet. */
export async function findApplicantAccountId(registrationId: string): Promise<string | null> {
  const reg = await prisma.classRegistration.findUnique({ where: { id: registrationId }, select: { email: true, user: { select: { id: true } } } });
  if (!reg) return null;
  const [withAccount] = await withApplicantAccounts([reg]);
  return withAccount.account && !withAccount.account.banned ? withAccount.account.id : null;
}

export type ApplicantSignUpLinkResult = "sent" | "recent" | "exists" | "invalid" | "failed" | "gone" | "rejected";

/**
 * "Send sign-up link" on an applicant with no account: the studio's own sign-up email to the address on the application
 * (sendRegisterInvite in studio mode: no referral, their email filled in, at most once a day per address).
 */
export async function sendApplicantSignUpLink(registrationId: string, adminId: string): Promise<ApplicantSignUpLinkResult> {
  const { sendRegisterInvite } = await import("@/lib/registerInvite");
  const reg = await prisma.classRegistration.findUnique({ where: { id: registrationId }, select: { email: true, status: true } });
  if (!reg) return "gone";
  if (reg.status === "REJECTED") return "rejected";
  return sendRegisterInvite(adminId, reg.email, { fromStudio: true });
}

/** What the studio sees after "Send sign-up link". */
export function applicantSignUpLinkMessage(result: ApplicantSignUpLinkResult, email: string): { ok: boolean; message: string } {
  switch (result) {
    case "sent":
      return { ok: true, message: `Sign-up link sent to ${email}.` };
    case "recent":
      return { ok: true, message: "A sign-up link already went to them today." };
    case "exists":
      return { ok: false, message: "They have an account now. Refresh to set it up." };
    case "invalid":
      return { ok: false, message: "The email on this application does not look right." };
    case "failed":
      return { ok: false, message: "Could not send. Check the address." };
    case "gone":
      return { ok: false, message: "That application is gone." };
    case "rejected":
      return { ok: false, message: "This application was turned down, so nothing was sent." };
  }
}

/**
 * Tells the studio when someone it approved before they had an account verifies their new one, with a link straight to setting up
 * their plan. Called once, when the email is verified (proof the address is theirs), so the application is also linked to the account.
 * Best-effort: never throws.
 */
export async function noticeApprovedApplicantJoined(user: { id: string; email: string; name: string | null }): Promise<void> {
  try {
    const reg = await prisma.classRegistration.findFirst({
      where: { email: { equals: user.email.trim(), mode: "insensitive" }, status: "APPROVED" },
      orderBy: { reviewedAt: "desc" },
      select: { id: true, fullName: true, instrument: true },
    });
    if (!reg) return;
    await prisma.classRegistration.updateMany({ where: { email: { equals: user.email.trim(), mode: "insensitive" }, userId: null }, data: { userId: user.id } });
    const admins = await getAdminRecipients("NEW_REGISTRATION");
    await Promise.all(
      admins.map((admin) =>
        createNotification({
          userId: admin.id,
          type: "ADMIN_ALERT",
          title: "An approved applicant made their account",
          body: `${reg.fullName} (${user.email}), approved for ${INSTRUMENT_LABEL[reg.instrument]} lessons, now has an account. Set up their plan next.`,
          emailCategory: "social",
          cta: { label: "Set up plan", path: `/admin/users/${user.id}?do=setup` },
        }).catch((err) => console.error("Applicant joined notice failed (non-blocking):", err)),
      ),
    );
  } catch (err) {
    console.error("Applicant joined notice failed (non-blocking):", err);
  }
}

async function notifyRegistrant(
  registration: { userId: string | null; email: string; instrument: PrimaryInstrument },
  outcome: "APPROVED" | "REJECTED",
  reason?: string,
) {
  const trialDays = (await getBoolSetting("trial.enabled")) ? await getNumberSetting("trial.days") : 0;
  const title = outcome === "APPROVED" ? "Your class registration was approved" : "Update on your class registration";
  const body =
    outcome === "APPROVED"
      ? `You're confirmed for ${INSTRUMENT_LABEL[registration.instrument]} lessons. ${trialDays > 0 ? `You have a ${trialDays}-day free trial of the first lessons in the curriculum, and w` : "W"}e'll be in touch with next steps.`
      : `We're not able to move forward with your registration for ${INSTRUMENT_LABEL[registration.instrument]} lessons right now.${reason ? ` ${reason}` : ""}`;

  // Always the address typed into the public form, never routed through
  // userId's account email, which can belong to someone else entirely (see
  // the note in submitClassRegistration).
  await sendNotificationEmail(registration.email, title, body).catch((err) =>
    console.error("Class registration email failed (non-blocking):", err),
  );

  // Additionally raise an in-app bell entry if they have a linked account,
  // no emailCategory here, since the email above already covers it and
  // this must never risk a second email to a different address.
  if (registration.userId) {
    await createNotification({
      userId: registration.userId,
      type: outcome === "APPROVED" ? "CLASS_REGISTRATION_APPROVED" : "CLASS_REGISTRATION_REJECTED",
      title,
      body,
    });
  }
}

/** Lets the admin who took the action see their own approve/reject confirmed, in-app + email. */
async function confirmReviewToAdmin(
  adminId: string,
  registration: { fullName: string; instrument: PrimaryInstrument },
  outcome: "APPROVED" | "REJECTED",
) {
  await createNotification({
    userId: adminId,
    type: outcome === "APPROVED" ? "CLASS_REGISTRATION_APPROVED" : "CLASS_REGISTRATION_REJECTED",
    title: outcome === "APPROVED" ? "You approved a class registration" : "You rejected a class registration",
    body: `${registration.fullName}'s registration for ${INSTRUMENT_LABEL[registration.instrument]} lessons was ${outcome === "APPROVED" ? "approved" : "rejected"}.`,
    emailCategory: "social",
    href: "/admin/students",
  });
}

export async function approveClassRegistration(registrationId: string, adminId: string) {
  const registration = await prisma.classRegistration.update({
    where: { id: registrationId },
    data: { status: "APPROVED", reviewedAt: new Date(), reviewedById: adminId, rejectionReason: null },
  });
  // Starts the one-time free trial if they already have an account (an
  // applicant who registers later gets it at sign-up). Best-effort: a
  // failure here must not undo the approval itself.
  await startTrialForEmail(registration.email).catch((err) =>
    console.error("Starting the free trial failed (non-blocking):", err),
  );
  await notifyRegistrant(registration, "APPROVED");
  await confirmReviewToAdmin(adminId, registration, "APPROVED");
  return registration;
}

export async function rejectClassRegistration(registrationId: string, adminId: string, reason: string) {
  const registration = await prisma.classRegistration.update({
    where: { id: registrationId },
    data: { status: "REJECTED", reviewedAt: new Date(), reviewedById: adminId, rejectionReason: reason },
  });
  await notifyRegistrant(registration, "REJECTED", reason);
  await confirmReviewToAdmin(adminId, registration, "REJECTED");
  return registration;
}

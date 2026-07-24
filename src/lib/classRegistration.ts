import type { ClassRegistrationStatus, PrimaryInstrument, SkillLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { sendNotificationEmail } from "@/lib/email";
import { INSTRUMENT_LABEL, SKILL_LABEL } from "@/lib/classRegistrationLabels";

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
 * Public lead-capture entry point — no account required. Fills userId
 * opportunistically when the submitter happens to be signed in, purely so
 * an approval can also raise an in-app Notification for them later.
 */
export async function submitClassRegistration(input: SubmitClassRegistrationInput) {
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  const notes = input.notes?.trim();

  if (!fullName) throw new Error("Full name is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  if (!phone) throw new Error("Phone number is required.");

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

  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
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
  return prisma.classRegistration.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, name: true, image: true, username: true } },
      reviewedBy: { select: { name: true } },
    },
  });
}

export type AdminClassRegistration = Awaited<ReturnType<typeof getAdminClassRegistrations>>[number];

async function notifyRegistrant(
  registration: { userId: string | null; email: string; instrument: PrimaryInstrument },
  outcome: "APPROVED" | "REJECTED",
  reason?: string,
) {
  const title = outcome === "APPROVED" ? "Your class registration was approved" : "Update on your class registration";
  const body =
    outcome === "APPROVED"
      ? `You're confirmed for ${INSTRUMENT_LABEL[registration.instrument]} lessons. We'll be in touch with next steps.`
      : `We're not able to move forward with your registration for ${INSTRUMENT_LABEL[registration.instrument]} lessons right now.${reason ? ` ${reason}` : ""}`;

  if (registration.userId) {
    await createNotification({
      userId: registration.userId,
      type: outcome === "APPROVED" ? "CLASS_REGISTRATION_APPROVED" : "CLASS_REGISTRATION_REJECTED",
      title,
      body,
      emailCategory: "social",
    });
    return;
  }

  await sendNotificationEmail(registration.email, title, body).catch((err) =>
    console.error("Class registration email failed (non-blocking):", err),
  );
}

export async function approveClassRegistration(registrationId: string, adminId: string) {
  const registration = await prisma.classRegistration.update({
    where: { id: registrationId },
    data: { status: "APPROVED", reviewedAt: new Date(), reviewedById: adminId, rejectionReason: null },
  });
  await notifyRegistrant(registration, "APPROVED");
  return registration;
}

export async function rejectClassRegistration(registrationId: string, adminId: string, reason: string) {
  const registration = await prisma.classRegistration.update({
    where: { id: registrationId },
    data: { status: "REJECTED", reviewedAt: new Date(), reviewedById: adminId, rejectionReason: reason },
  });
  await notifyRegistrant(registration, "REJECTED", reason);
  return registration;
}

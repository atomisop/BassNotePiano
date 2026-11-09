"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { addHold, addSession, ContactError, createContact, deleteContact, deleteSession, releaseHold, updateContact, type ContactInput } from "@/lib/contacts";
import { reportError } from "@/lib/reportError";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { sendRegisterInvite } from "@/lib/registerInvite";
import { RateLimitError } from "@/lib/rateLimit";

async function requireAdmin() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin/contacts");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  return session.user;
}

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function run<T extends object>(work: () => Promise<T>): Promise<Result<T>> {
  await requireAdmin();
  try {
    const value = await work();
    revalidatePath("/", "layout");
    return { ok: true, ...value };
  } catch (err) {
    if (err instanceof ContactError) return { ok: false, error: err.message };
    reportError(err, "Contacts action");
    return { ok: false, error: "Something went wrong." };
  }
}

export async function createContactAction(input: ContactInput): Promise<Result<{ id: string }>> {
  return run(async () => ({ id: (await createContact(input)).id }));
}

export async function updateContactAction(contactId: string, input: ContactInput): Promise<Result> {
  return run(async () => {
    await updateContact(contactId, input);
    return {};
  });
}

export async function deleteContactAction(contactId: string): Promise<Result> {
  return run(async () => {
    await deleteContact(contactId);
    return {};
  });
}

/** Keeps a weekly time for a contact. `newTime` ("Another time…") is a day and start time with no window yet: one is made for it. */
export async function addHoldAction(contactId: string, scheduleId: string, chunkIndex: number, until: string | null, note: string | null, newTime?: { dayOfWeek: number; startTime: string } | null): Promise<Result> {
  const admin = await requireAdmin();
  return run(async () => {
    const time = newTime ? { dayOfWeek: Number(newTime.dayOfWeek), startTime: String(newTime.startTime ?? "") } : null;
    const hold = await addHold(String(contactId), String(scheduleId ?? ""), Number(chunkIndex), until, note, time);
    if (hold.createdWindowId) {
      await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "schedule.add-time", targetType: "ClassSchedule", targetId: hold.createdWindowId, detail: "Added a weekly time to keep it for a contact" });
    }
    return {};
  });
}

/**
 * "Send sign-up link" on a contact: emails them an invitation to create an account with the email on file (the studio's wording, no
 * referral). Never to an address that already has an account, at most once every 14 days per address (sendRegisterInvite).
 */
export async function sendContactSignUpAction(contactId: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const contact = await prisma.contact.findUnique({ where: { id: String(contactId) }, select: { email: true } });
  if (!contact) return { ok: false, error: "That person was not found." };
  if (!contact.email) return { ok: false, error: "Add their email first, then send the link." };
  try {
    const result = await sendRegisterInvite(admin.id, contact.email, { fromStudio: true });
    if (result === "sent") return { ok: true, message: `Sign-up link sent to ${contact.email}` };
    if (result === "exists") return { ok: false, error: "That email already has an account. Refresh to set up their plan." };
    if (result === "recent") return { ok: false, error: "A sign-up link went to that email in the last 14 days. Give it a little time." };
    if (result === "invalid") return { ok: false, error: "That email does not look right. Fix it in Details first." };
    return { ok: false, error: "The email could not be sent. Try again later." };
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    reportError(err, "Contact sign-up link");
    return { ok: false, error: "Something went wrong." };
  }
}

export async function releaseHoldAction(holdId: string): Promise<Result> {
  return run(async () => {
    await releaseHold(holdId);
    return {};
  });
}

export async function addSessionAction(contactId: string, day: string, attended: boolean, note: string | null): Promise<Result> {
  return run(async () => {
    await addSession(contactId, day, attended, note);
    return {};
  });
}

export async function deleteSessionAction(sessionId: string): Promise<Result> {
  return run(async () => {
    await deleteSession(sessionId);
    return {};
  });
}

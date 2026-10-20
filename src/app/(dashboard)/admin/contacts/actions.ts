"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { addHold, addSession, ContactError, createContact, deleteContact, deleteSession, releaseHold, updateContact, type ContactInput } from "@/lib/contacts";
import { reportError } from "@/lib/reportError";

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

export async function addHoldAction(contactId: string, scheduleId: string, chunkIndex: number, until: string | null, note: string | null): Promise<Result> {
  return run(async () => {
    await addHold(contactId, scheduleId, chunkIndex, until, note);
    return {};
  });
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

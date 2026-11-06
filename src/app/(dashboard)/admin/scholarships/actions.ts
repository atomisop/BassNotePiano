"use server";

import { revalidatePath } from "next/cache";
import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { createScholarshipCode, findScholarshipAccount, regenerateScholarshipCode, revokeScholarshipCode, ScholarshipError, updateScholarshipCode } from "@/lib/scholarships";
import { formatScholarshipCode } from "@/lib/scholarshipRules";

async function requireOwner() {
  const session = await getServerAuthSession();
  if (!session?.user || session.user.role !== "ADMIN" || !isOwnerEmail(session.user.email)) throw new ScholarshipError("Only the owner can manage scholarships.");
  return { id: session.user.id, email: session.user.email ?? null };
}

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (err: unknown) => ({ ok: false as const, error: err instanceof ScholarshipError ? err.message : "Something went wrong. Please try again." });

export async function createScholarshipAction(input: { email: string; classes: number; code: string; note: string; expiresOn: string }): Promise<Result<{ code: string }>> {
  try {
    const actor = await requireOwner();
    const expiresAt = input.expiresOn ? new Date(`${input.expiresOn}T23:59:59-05:00`) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new ScholarshipError("Enter a valid last claim day.");
    const row = await createScholarshipCode({ email: input.email, classes: Number(input.classes), code: input.code, note: input.note, expiresAt, actor });
    revalidatePath("/admin/scholarships");
    return { ok: true, code: formatScholarshipCode(row.code) };
  } catch (err) {
    if (!(err instanceof ScholarshipError)) console.error(err);
    return fail(err);
  }
}

export async function revokeScholarshipAction(id: string): Promise<Result> {
  try {
    const actor = await requireOwner();
    await revokeScholarshipCode(id, actor);
    revalidatePath("/admin/scholarships");
    return { ok: true };
  } catch (err) {
    if (!(err instanceof ScholarshipError)) console.error(err);
    return fail(err);
  }
}

const toExpiry = (expiresOn: string) => {
  if (!expiresOn) return null;
  const d = new Date(`${expiresOn}T23:59:59-05:00`);
  if (Number.isNaN(d.getTime())) throw new ScholarshipError("Enter a valid last claim day.");
  return d;
};

export async function updateScholarshipAction(id: string, input: { classes: number; note: string; expiresOn: string }): Promise<Result> {
  try {
    const actor = await requireOwner();
    await updateScholarshipCode(id, { classes: Number(input.classes), note: input.note, expiresAt: toExpiry(input.expiresOn) }, actor);
    revalidatePath("/admin/scholarships");
    return { ok: true };
  } catch (err) {
    if (!(err instanceof ScholarshipError)) console.error(err);
    return fail(err);
  }
}

export async function regenerateScholarshipAction(id: string): Promise<Result<{ code: string }>> {
  try {
    const actor = await requireOwner();
    const code = await regenerateScholarshipCode(id, actor);
    revalidatePath("/admin/scholarships");
    return { ok: true, code: formatScholarshipCode(code) };
  } catch (err) {
    if (!(err instanceof ScholarshipError)) console.error(err);
    return fail(err);
  }
}

/** Live check behind the email box: is there a student account with this email? */
export async function lookupScholarshipAccountAction(email: string): Promise<Result<{ name: string | null; email: string; verified: boolean } | { found: false }>> {
  try {
    await requireOwner();
    const a = await findScholarshipAccount(email);
    return a ? { ok: true, name: a.name, email: a.email, verified: a.verified } : { ok: true, found: false };
  } catch (err) {
    return fail(err);
  }
}

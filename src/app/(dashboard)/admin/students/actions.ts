"use server";

import { withStudentNotice } from "@/lib/notifyScope";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import {
  applicantSignUpLinkMessage,
  approveClassRegistration,
  findApplicantAccountId,
  rejectClassRegistration,
  sendApplicantSignUpLink,
} from "@/lib/classRegistration";
import { runOnce } from "@/lib/idempotency";
import { RateLimitError } from "@/lib/rateLimit";
import { prisma } from "@/lib/prisma";

// The admin layout's redirect only protects rendering, Server Actions are
// separate RPC endpoints the layout never runs for, so this is the actual
// authorization check for these mutations, not just a UX nicety.
async function requireAdmin() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin/students");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  return session.user;
}

/** Approves an application. Answers with the applicant's account, if they have one, so the screen can offer "Set up plan" next. */
export async function approveRegistrationAction(registrationId: string, notify = true): Promise<{ accountId: string | null }> {
  return withStudentNotice(notify, async () => {
    const admin = await requireAdmin();
    await approveClassRegistration(registrationId, admin.id);
    revalidatePath("/admin/students");
    return { accountId: await findApplicantAccountId(registrationId) };
  });
}

export async function rejectRegistrationAction(registrationId: string, reason: string, notify = true) {
  return withStudentNotice(notify, async () => {
    const admin = await requireAdmin();
    await rejectClassRegistration(registrationId, admin.id, reason);
    revalidatePath("/admin/students");
  });
}

/**
 * "Send sign-up link" on an applicant with no account yet. Sending the email is the whole point, so it does not follow the Notify switch.
 * A double tap sends once (runOnce), and the same address gets at most one link a day.
 */
export async function sendApplicantSignUpLinkAction(registrationId: string, idempotencyKey?: string): Promise<{ ok: boolean; message: string }> {
  const admin = await requireAdmin();
  return runOnce(
    admin.id,
    "applicant-signup-link",
    idempotencyKey,
    async () => {
      const reg = await prisma.classRegistration.findUnique({ where: { id: String(registrationId) }, select: { email: true } });
      try {
        const result = await sendApplicantSignUpLink(String(registrationId), admin.id);
        if (result === "sent") revalidatePath("/admin/students");
        return applicantSignUpLinkMessage(result, reg?.email ?? "them");
      } catch (err) {
        if (err instanceof RateLimitError) return { ok: false, message: err.message };
        throw err;
      }
    },
    { isSuccess: (r) => r.ok, whileRunning: { ok: false, message: "Already sending." } },
  );
}

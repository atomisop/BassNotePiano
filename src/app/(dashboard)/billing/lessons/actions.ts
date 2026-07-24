"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { LessonType } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import {
  getOrCreatePendingLessonPayment,
  submitZellePaymentReference,
  type ZelleReferenceSubmission,
} from "@/lib/payments";

export async function createLessonPendingPaymentAction(quantity: number, type: LessonType) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/lessons");

  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";
  const payment = await getOrCreatePendingLessonPayment(session.user.id, quantity, type, zelleHandle);

  return {
    id: payment.id,
    status: payment.status,
    rejectionReason: payment.rejectionReason,
    amountCents: payment.amountCents,
  };
}

export async function submitLessonPaymentAction(paymentId: string, payload: ZelleReferenceSubmission) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/lessons");

  await submitZellePaymentReference(session.user.id, paymentId, payload);
  revalidatePath("/billing/lessons");
}

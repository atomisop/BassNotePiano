"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { submitZellePaymentReference, type ZelleReferenceSubmission } from "@/lib/payments";

export async function submitCurriculumPaymentAction(paymentId: string, payload: ZelleReferenceSubmission) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/curriculum");

  await submitZellePaymentReference(session.user.id, paymentId, payload);

  revalidatePath("/billing/curriculum");
}

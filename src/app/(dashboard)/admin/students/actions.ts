"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { approveClassRegistration, rejectClassRegistration } from "@/lib/classRegistration";

// The admin layout's redirect only protects rendering, Server Actions are
// separate RPC endpoints the layout never runs for, so this is the actual
// authorization check for these mutations, not just a UX nicety.
async function requireAdmin() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin/students");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  return session.user;
}

export async function approveRegistrationAction(registrationId: string) {
  const admin = await requireAdmin();
  await approveClassRegistration(registrationId, admin.id);
  revalidatePath("/admin/students");
}

export async function rejectRegistrationAction(registrationId: string, reason: string) {
  const admin = await requireAdmin();
  await rejectClassRegistration(registrationId, admin.id, reason);
  revalidatePath("/admin/students");
}

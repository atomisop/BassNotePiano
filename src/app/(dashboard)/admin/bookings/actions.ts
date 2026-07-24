"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { completeLessonBooking, cancelLessonBooking } from "@/lib/lessons";

// The admin layout's redirect only protects rendering — Server Actions are
// separate RPC endpoints the layout never runs for, so this is the actual
// authorization check for these mutations, not just a UX nicety.
async function requireAdmin() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin/bookings");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  return session.user;
}

export async function completeBookingAction(bookingId: string) {
  await requireAdmin();
  await completeLessonBooking(bookingId);
  revalidatePath("/admin/bookings");
}

export async function cancelBookingAction(bookingId: string, reason: string) {
  await requireAdmin();
  await cancelLessonBooking(bookingId, reason || undefined);
  revalidatePath("/admin/bookings");
}

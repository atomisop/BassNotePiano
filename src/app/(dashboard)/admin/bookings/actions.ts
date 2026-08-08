"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AttendanceStatus } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import { markAttendance, adminCancelClassBooking, ClassBookingError } from "@/lib/classSchedule";

// The admin layout's redirect only protects rendering — Server Actions are
// separate RPC endpoints the layout never runs for, so this is the actual
// authorization check for this mutation, not just a UX nicety.
async function requireAdmin() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin/bookings");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  return session.user;
}

export async function markAttendanceAction(bookingId: string, attendance: AttendanceStatus) {
  await requireAdmin();
  await markAttendance(bookingId, attendance);
  revalidatePath("/admin/bookings");
}

export async function adminCancelBookingAction(bookingId: string, reason?: string) {
  await requireAdmin();
  try {
    await adminCancelClassBooking(bookingId, reason);
    revalidatePath("/admin/bookings");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof ClassBookingError ? err.message : "Something went wrong." };
  }
}

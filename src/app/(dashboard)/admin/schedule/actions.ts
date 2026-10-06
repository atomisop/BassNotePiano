"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AttendanceStatus } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import { bookMissingReservedWindows, cancelUnpaidSubscription, PaymentPlanError } from "@/lib/paymentPlans";
import {
  createClassSchedule,
  updateClassSchedule,
  setClassScheduleActive,
  markAttendance,
  undoAttendance,
  adminCancelClassBooking,
  adminBookClass,
  getPendingAttendanceBookings,
  getBookingFeed,
  ClassScheduleError,
  ClassBookingError,
  type ClassScheduleInput,
  type PendingAttendanceRow,
  type BookingFeedRow,
} from "@/lib/classSchedule";
import { searchStudentsForBooking, type BookableStudent } from "@/lib/admin";

async function requireAdmin() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin/schedule");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  return session.user;
}

export async function createClassScheduleAction(input: ClassScheduleInput) {
  await requireAdmin();
  try {
    await createClassSchedule(input);
    revalidatePath("/admin/schedule");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof ClassScheduleError ? err.message : "Something went wrong." };
  }
}

export async function updateClassScheduleAction(scheduleId: string, input: ClassScheduleInput) {
  await requireAdmin();
  try {
    await updateClassSchedule(scheduleId, input);
    revalidatePath("/admin/schedule");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof ClassScheduleError ? err.message : "Something went wrong." };
  }
}

export async function setClassScheduleActiveAction(scheduleId: string, active: boolean) {
  await requireAdmin();
  await setClassScheduleActive(scheduleId, active);
  revalidatePath("/admin/schedule");
  return { ok: true as const };
}

// Moved here from the old, now-removed /admin/bookings route — folded into
// Schedule as its "Bookings & attendance" tab instead of its own top-level
// nav slot, by direct instruction: both act on the exact same weekly-
// schedule data, one defining it, the other operating on it day to day.
export async function markAttendanceAction(bookingId: string, attendance: AttendanceStatus) {
  await requireAdmin();
  await markAttendance(bookingId, attendance);
  revalidatePath("/admin/schedule");
}

/**
 * Full reversal of a mistaken attendance mark — refunds the credit, not
 * just correcting Present vs. No-show (re-calling markAttendanceAction
 * above already does that safely, with no credit change either way). By
 * direct instruction: marking attendance charges a real credit, so it
 * needed a genuine undo, not just a re-pick.
 */
export async function undoAttendanceAction(bookingId: string) {
  await requireAdmin();
  try {
    await undoAttendance(bookingId);
    revalidatePath("/admin/schedule");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof ClassBookingError ? err.message : "Something went wrong." };
  }
}

/**
 * Feeds the TopBar's own quick-attendance panel (AdminAttendanceQuickPanel)
 * — by direct instruction, marking a class Present/No-show shouldn't
 * require navigating into the full admin Schedule page first. Same
 * markAttendanceAction above does the actual write; this just supplies the
 * short list of "needs a call right now" bookings the panel polls for.
 */
export async function getPendingAttendanceBookingsAction(): Promise<PendingAttendanceRow[]> {
  await requireAdmin();
  return getPendingAttendanceBookings();
}

/** Feeds the TopBar's class-bookings panel: every active booking, soonest first. */
export async function getBookingFeedAction(): Promise<BookingFeedRow[]> {
  await requireAdmin();
  await bookMissingReservedWindows();
  return getBookingFeed();
}

/** Cancels a subscription that is still waiting for its first payment (the "Waiting for payment" row in the Attendance panel). */
export async function adminCancelWaitingSubscriptionAction(planId: string) {
  const admin = await requireAdmin();
  try {
    await cancelUnpaidSubscription(planId, admin.id);
    revalidatePath("/admin/schedule");
    revalidatePath("/admin/payment-plans");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof PaymentPlanError ? err.message : "Something went wrong." };
  }
}

export async function adminCancelBookingAction(bookingId: string, reason?: string) {
  await requireAdmin();
  try {
    await adminCancelClassBooking(bookingId, reason);
    revalidatePath("/admin/schedule");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof ClassBookingError ? err.message : "Something went wrong." };
  }
}

export async function searchStudentsForBookingAction(query: string): Promise<BookableStudent[]> {
  await requireAdmin();
  return searchStudentsForBooking(query);
}

export async function adminBookClassAction(
  studentId: string,
  scheduleId: string,
  occurrenceDateMs: number,
  chunkIndex: number,
  creditsToBook: number,
) {
  await requireAdmin();
  try {
    await adminBookClass(studentId, scheduleId, occurrenceDateMs, chunkIndex, creditsToBook);
    revalidatePath("/admin/schedule");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof ClassBookingError ? err.message : "Something went wrong." };
  }
}

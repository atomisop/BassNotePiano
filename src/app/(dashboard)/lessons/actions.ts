"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import {
  bookClass,
  bookClassBundle,
  bookFamilyClass,
  checkFamilyClassAttendees,
  cancelClassBooking,
  ClassBookingError,
  type BundleBookingSelection,
} from "@/lib/classSchedule";
import { RateLimitError } from "@/lib/rateLimit";

export async function bookClassAction(scheduleId: string, occurrenceDateMs: number, chunkIndex: number, creditsToBook?: number) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/lessons");
  // Mirrors the page-level redirect — re-checked here since this Server
  // Action is its own RPC endpoint, not something the page redirect covers.
  if (!session.user.hasCurriculumAccess) redirect("/billing/curriculum?next=lessons");

  try {
    const booking = await bookClass(session.user.id, scheduleId, occurrenceDateMs, chunkIndex, creditsToBook);
    revalidatePath("/lessons");
    return { ok: true as const, id: booking.id };
  } catch (err) {
    return { ok: false as const, error: err instanceof ClassBookingError || err instanceof RateLimitError ? err.message : "Something went wrong." };
  }
}

/** Same guards as bookClassAction — this is the bundle-of-several version, see bookClassBundle. */
export async function bookClassBundleAction(selections: BundleBookingSelection[]) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/lessons");
  if (!session.user.hasCurriculumAccess) redirect("/billing/curriculum?next=lessons");

  if (selections.length === 0) return { ok: false as const, error: "Select at least one class first." };

  const results = await bookClassBundle(session.user.id, selections);
  revalidatePath("/lessons");
  return { ok: true as const, results };
}

/** Live check while the booker is still typing attendee emails — see checkFamilyClassAttendees's own comment. */
export async function checkFamilyClassAttendeesAction(emails: string[]) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/lessons");
  return checkFamilyClassAttendees(session.user.id, emails);
}

export async function bookFamilyClassAction(scheduleId: string, occurrenceDateMs: number, chunkIndex: number, attendeeEmails: string[]) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/lessons");
  if (!session.user.hasCurriculumAccess) redirect("/billing/curriculum?next=lessons");

  try {
    const bookings = await bookFamilyClass(session.user.id, scheduleId, occurrenceDateMs, chunkIndex, attendeeEmails);
    revalidatePath("/lessons");
    return { ok: true as const, ids: bookings.map((b) => b.id) };
  } catch (err) {
    return { ok: false as const, error: err instanceof ClassBookingError || err instanceof RateLimitError ? err.message : "Something went wrong." };
  }
}

export async function cancelClassBookingAction(bookingId: string) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/lessons");

  try {
    const result = await cancelClassBooking(bookingId, session.user.id);
    revalidatePath("/lessons");
    return { ok: true as const, refunded: result.refunded };
  } catch (err) {
    return { ok: false as const, error: err instanceof ClassBookingError || err instanceof RateLimitError ? err.message : "Something went wrong." };
  }
}

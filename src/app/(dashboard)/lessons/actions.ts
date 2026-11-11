"use server";

import { hasParentControl, PARENT_CONTROL_MESSAGE } from "@/lib/parentLinks";
import { runOnce } from "@/lib/idempotency";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import {
  bookClass,
  bookClassBundle,
  bookFamilyClass,
  checkFamilyClassAttendees,
  cancelClassBooking,
  rescheduleClassBooking,
  getReservableSlots,
  ClassBookingError,
  type BundleBookingSelection,
  type ReservableSlot,
} from "@/lib/classSchedule";
import { changeReservedSlot, getActivePaymentPlan, PaymentPlanError } from "@/lib/paymentPlans";
import { PLAN_CADENCE_CREDITS_PER_WEEK } from "@/lib/classCreditPricing";
import { assertRateLimit, RateLimitError } from "@/lib/rateLimit";
import { prisma } from "@/lib/prisma";
import { openBookingSupportCase, openSubjectSupportCase, AssistantEscalationError } from "@/lib/support";
import { BookingRequestError, cancelBookingRequest, createBookingRequests, type RequestSelection } from "@/lib/bookingRequests";

export async function bookClassAction(scheduleId: string, occurrenceDateMs: number, chunkIndex: number, creditsToBook?: number) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/lessons");
  if (await hasParentControl(session.user.id)) return { ok: false as const, error: PARENT_CONTROL_MESSAGE };
  // Mirrors the page-level redirect, re-checked here since this Server
  // Action is its own RPC endpoint, not something the page redirect covers.

  try {
    const booking = await bookClass(session.user.id, scheduleId, occurrenceDateMs, chunkIndex, creditsToBook);
    revalidatePath("/", "layout");
    return { ok: true as const, id: booking.id };
  } catch (err) {
    return { ok: false as const, error: err instanceof ClassBookingError || err instanceof RateLimitError ? err.message : "Something went wrong." };
  }
}

/** Same guards as bookClassAction, this is the bundle-of-several version, see bookClassBundle. */
export async function bookClassBundleAction(selections: BundleBookingSelection[]) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/lessons");
  if (await hasParentControl(session.user.id)) return { ok: false as const, error: PARENT_CONTROL_MESSAGE };

  if (selections.length === 0) return { ok: false as const, error: "Select at least one class first." };
  if (selections.length > 10) return { ok: false as const, error: "You can book up to 10 classes at once." };

  const results = await bookClassBundle(session.user.id, selections);
  revalidatePath("/", "layout");
  return { ok: true as const, results };
}

/** Request mode: sends the picked times to the teacher instead of booking them. Each time is answered on its own. */
export async function requestClassTimesAction(selections: RequestSelection[]) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/lessons");
  // Same rule as booking: a child whose parent controls their schedule cannot ask for class times either.
  if (await hasParentControl(session.user.id)) return { ok: false as const, error: PARENT_CONTROL_MESSAGE };

  try {
    const results = await createBookingRequests(session.user.id, selections);
    revalidatePath("/", "layout");
    return { ok: true as const, results };
  } catch (err) {
    return { ok: false as const, error: err instanceof BookingRequestError || err instanceof ClassBookingError || err instanceof RateLimitError ? err.message : "Something went wrong." };
  }
}

export async function cancelBookingRequestAction(requestId: string) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/lessons");
  if (await hasParentControl(session.user.id)) return { ok: false as const, error: PARENT_CONTROL_MESSAGE };

  try {
    await cancelBookingRequest(requestId, session.user.id);
    revalidatePath("/", "layout");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof BookingRequestError ? err.message : "Something went wrong." };
  }
}

/** Live check while the booker is still typing attendee emails, see checkFamilyClassAttendees's own comment. */
export async function checkFamilyClassAttendeesAction(emails: string[]) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/lessons");
  return checkFamilyClassAttendees(session.user.id, emails);
}

export async function bookFamilyClassAction(scheduleId: string, occurrenceDateMs: number, chunkIndex: number, attendeeEmails: string[], idempotencyKey?: string) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/lessons");
  if (await hasParentControl(session.user.id)) return { ok: false as const, error: PARENT_CONTROL_MESSAGE };
  const userId = session.user.id;

  type Result = { ok: true; ids: string[] } | { ok: false; error: string };
  return runOnce<Result>(
    userId,
    "book-family-class",
    idempotencyKey,
    async () => {
      try {
        const bookings = await bookFamilyClass(userId, scheduleId, occurrenceDateMs, chunkIndex, attendeeEmails);
        revalidatePath("/", "layout");
        return { ok: true as const, ids: bookings.map((b) => b.id) };
      } catch (err) {
        return { ok: false as const, error: err instanceof ClassBookingError || err instanceof RateLimitError ? err.message : "Something went wrong." };
      }
    },
    { isSuccess: (r) => r.ok, whileRunning: { ok: false, error: "Booking your class. One moment." } },
  );
}

export async function cancelClassBookingAction(bookingId: string) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/lessons");
  if (await hasParentControl(session.user.id)) return { ok: false as const, error: PARENT_CONTROL_MESSAGE };

  try {
    const result = await cancelClassBooking(bookingId, session.user.id);
    revalidatePath("/", "layout");
    return { ok: true as const, refunded: result.refunded };
  } catch (err) {
    return { ok: false as const, error: err instanceof ClassBookingError || err instanceof RateLimitError ? err.message : "Something went wrong." };
  }
}

export async function rescheduleClassBookingAction(
  bookingId: string,
  newScheduleId: string,
  newOccurrenceDateMs: number,
  newChunkIndex: number,
  newCreditsToBook?: number,
) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/lessons");
  if (await hasParentControl(session.user.id)) return { ok: false as const, error: PARENT_CONTROL_MESSAGE };

  try {
    const booking = await rescheduleClassBooking(session.user.id, bookingId, newScheduleId, newOccurrenceDateMs, newChunkIndex, newCreditsToBook);
    revalidatePath("/", "layout");
    return { ok: true as const, id: booking.id, scheduledAt: booking.scheduledAt.toISOString() };
  } catch (err) {
    return { ok: false as const, error: err instanceof ClassBookingError || err instanceof RateLimitError ? err.message : "Something went wrong." };
  }
}

/** Every open slot the caller's own active plan could move its reservation to, empty if they have no active plan. */
export async function getReservableSlotsForChangeAction(): Promise<ReservableSlot[]> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/lessons");

  const plan = await getActivePaymentPlan(session.user.id);
  if (!plan) return [];
  return getReservableSlots(PLAN_CADENCE_CREDITS_PER_WEEK[plan.cadence]);
}

/** Payment Plan subscriber's own self-service move of their standing weekly slot, see changeReservedSlot's own comment. */
export async function changeReservedSlotAction(newScheduleId: string, newChunkIndex: number) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/lessons");
  if (await hasParentControl(session.user.id)) return { ok: false as const, error: PARENT_CONTROL_MESSAGE };

  try {
    await changeReservedSlot(session.user.id, newScheduleId, newChunkIndex);
    revalidatePath("/", "layout");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof PaymentPlanError ? err.message : "Something went wrong." };
  }
}

/** "Message support" on a booked class: opens a support case with the subject Booking and returns its id. */
export async function contactSupportAboutBookingAction(
  bookingId: string,
): Promise<{ ok: true; escalationId: string } | { ok: false; error: string }> {
  const session = await getServerAuthSession();
  if (!session?.user) return { ok: false, error: "Sign in again." };
  try {
    // Opening a case pings every admin, so it is rate limited like the Atom handoff.
    await assertRateLimit(
      prisma.assistantEscalation.count,
      { identifier: `user:${session.user.id}` },
      { windowMinutes: 60, max: 5, message: "You've already reached out. The team will follow up soon." },
    );
    const { escalationId } = await openBookingSupportCase(session.user.id, bookingId);
    return { ok: true, escalationId };
  } catch (err) {
    if (err instanceof RateLimitError || err instanceof AssistantEscalationError) return { ok: false, error: err.message };
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** The button under an error that says "message support": opens a Booking case quoting what went wrong. */
export async function contactSupportAboutBookingProblemAction(
  problem: string,
): Promise<{ ok: true; escalationId: string } | { ok: false; error: string }> {
  const session = await getServerAuthSession();
  if (!session?.user) return { ok: false, error: "Sign in again." };
  try {
    await assertRateLimit(
      prisma.assistantEscalation.count,
      { identifier: `user:${session.user.id}` },
      { windowMinutes: 60, max: 5, message: "You've already reached out. The team will follow up soon." },
    );
    const quoted = problem.replace(/\s+/g, " ").trim().slice(0, 300);
    const { escalationId } = await openSubjectSupportCase(session.user.id, {
      subject: "Booking",
      contextLine: quoted,
      request: `I need help with a booking. The app told me: "${quoted}"`,
      noticeTitle: (name) => `${name} needs help with a booking`,
      noticeBody: quoted,
    });
    return { ok: true, escalationId };
  } catch (err) {
    if (err instanceof RateLimitError || err instanceof AssistantEscalationError) return { ok: false, error: err.message };
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

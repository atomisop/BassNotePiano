"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { bookClass, cancelClassBooking, ClassBookingError } from "@/lib/classSchedule";

export async function bookClassAction(scheduleId: string, occurrenceDateMs: number) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/lessons");

  try {
    const booking = await bookClass(session.user.id, scheduleId, occurrenceDateMs);
    revalidatePath("/lessons");
    return { ok: true as const, id: booking.id };
  } catch (err) {
    return { ok: false as const, error: err instanceof ClassBookingError ? err.message : "Something went wrong." };
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
    return { ok: false as const, error: err instanceof ClassBookingError ? err.message : "Something went wrong." };
  }
}

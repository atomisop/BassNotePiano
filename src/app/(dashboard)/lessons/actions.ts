"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { LessonType } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import { createLessonBooking } from "@/lib/lessons";

export async function bookLessonAction(type: LessonType, scheduledAtIso: string, notes: string) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/lessons");

  try {
    const booking = await createLessonBooking(session.user.id, type, new Date(scheduledAtIso), notes);
    revalidatePath("/lessons");
    return { ok: true as const, id: booking.id };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

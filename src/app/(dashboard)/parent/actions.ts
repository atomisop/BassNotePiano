"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RateLimitError } from "@/lib/rateLimit";
import {
  assertParentOf,
  cancelParentLinkByEmail,
  endParentLink,
  listLinkStatesFromParent,
  listLinksFromParent,
  listLinksToChild,
  ParentLinkError,
  respondToParentLink,
  sendParentLink,
  type LinkState,
  type LinkedChild,
  type ParentRequest,
} from "@/lib/parentLinks";
import { bookClass, cancelClassBooking, ClassBookingError, getReservableSlots, getUpcomingOccurrences, rescheduleClassBooking } from "@/lib/classSchedule";
import { cancelPaymentPlanBySelf, changeReservedSlot, PaymentPlanError } from "@/lib/paymentPlans";
import { getHoldChoices } from "@/lib/contacts";
import { PLAN_CADENCE_CREDITS_PER_WEEK } from "@/lib/classCreditPricing";
import { createNotification } from "@/lib/notifications";
import { formatEtDateTime } from "@/lib/classScheduleLabels";

async function requireUser() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/account");
  return session.user;
}

type Fail = { ok: false; error: string };
const messageOf = (err: unknown, fallback = "Something went wrong. Try again."): string =>
  err instanceof ParentLinkError || err instanceof ClassBookingError || err instanceof PaymentPlanError || err instanceof RateLimitError ? err.message : fallback;

// ---------------------------------------------------------------------------
// Linking (settings and the plan form)
// ---------------------------------------------------------------------------

export async function sendParentLinkAction(email: string): Promise<{ ok: boolean; status: LinkState | null; error: string | null }> {
  const user = await requireUser();
  try {
    const status = await sendParentLink(user.id, email);
    revalidatePath("/account");
    return { ok: true, status, error: null };
  } catch (err) {
    return { ok: false, status: null, error: messageOf(err) };
  }
}

export async function cancelParentLinkAction(email: string): Promise<void> {
  const user = await requireUser();
  await cancelParentLinkByEmail(user.id, email);
  revalidatePath("/account");
}

/** The plan form's view of each typed email: asked, accepted or declined. */
export async function listParentLinksAction(): Promise<{ email: string; status: LinkState }[]> {
  const user = await requireUser();
  return listLinkStatesFromParent(user.id);
}

export async function respondToParentLinkAction(linkId: string, accept: boolean): Promise<{ ok: true } | Fail> {
  const user = await requireUser();
  try {
    await respondToParentLink(user.id, linkId, accept);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

/** Either side ends the link; `otherId` is the other account. */
export async function endParentLinkAction(otherId: string): Promise<{ ok: true }> {
  const user = await requireUser();
  await endParentLink(user.id, otherId);
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// A linked child's classes and weekly time. The parent acts as the child: the same rules a student has apply (cancel and move cutoffs,
// credits, one class a day), and the child is told what was done.
// ---------------------------------------------------------------------------

async function actingFor(childId: string) {
  const parent = await requireUser();
  await assertParentOf(parent.id, childId);
  const parentRow = await prisma.user.findUnique({ where: { id: parent.id }, select: { name: true, email: true } });
  return { parent, parentName: parentRow?.name ?? parentRow?.email ?? "Your parent" };
}

export async function parentCancelClassAction(childId: string, bookingId: string): Promise<{ ok: true } | Fail> {
  try {
    const { parentName } = await actingFor(childId);
    const booking = await prisma.classBooking.findUnique({ where: { id: bookingId }, select: { scheduledAt: true, studentId: true } });
    if (!booking || booking.studentId !== childId) return { ok: false, error: "That class was not found." };
    await cancelClassBooking(bookingId, childId);
    await createNotification({ userId: childId, type: "LESSON_BOOKING_CANCELED", title: "A class was canceled for you", body: `${parentName} canceled your ${formatEtDateTime(booking.scheduledAt)} class.`, emailCategory: "classes" }).catch(() => undefined);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

export async function parentMoveClassAction(childId: string, bookingId: string, scheduleId: string, occurrenceDateMs: number, chunkIndex: number): Promise<{ ok: true } | Fail> {
  try {
    await actingFor(childId);
    await rescheduleClassBooking(childId, bookingId, scheduleId, occurrenceDateMs, chunkIndex);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

export async function parentBookClassAction(childId: string, scheduleId: string, occurrenceDateMs: number, chunkIndex: number): Promise<{ ok: true } | Fail> {
  try {
    const { parentName } = await actingFor(childId);
    await bookClass(childId, scheduleId, occurrenceDateMs, chunkIndex, undefined, { isAdminAssisted: false });
    await createNotification({ userId: childId, type: "LESSON_BOOKING_CONFIRMED", title: "A class was booked for you", body: `${parentName} booked a class for you. See it under Online Lessons.`, emailCategory: "classes", cta: { label: "See your classes", path: "/lessons" } }).catch(() => undefined);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

export interface OpenClassSlot {
  scheduleId: string;
  occurrenceDateMs: number;
  chunkIndex: number;
  scheduledAt: string;
  label: string | null;
}

/** The next open class times a child could be booked or moved into. */
export async function childOpenSlotsAction(childId: string): Promise<{ ok: true; slots: OpenClassSlot[] } | Fail> {
  try {
    await actingFor(childId);
    const open = (await getUpcomingOccurrences(childId)).filter((o) => !o.isBooked).slice(0, 40);
    return { ok: true, slots: open.map((o) => ({ scheduleId: o.scheduleId, occurrenceDateMs: o.occurrenceDate.getTime(), chunkIndex: o.chunkIndex, scheduledAt: o.scheduledAt.toISOString(), label: o.label })) };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

export interface WeeklyChoice {
  scheduleId: string;
  chunkIndex: number;
  label: string;
}

/** The free weekly times the child's plan could move to, and the one it holds now. */
export async function childWeeklyChoicesAction(childId: string): Promise<{ ok: true; current: string | null; choices: WeeklyChoice[] } | Fail> {
  try {
    await actingFor(childId);
    const plan = await prisma.paymentPlan.findFirst({ where: { userId: childId, status: "ACTIVE" }, select: { cadence: true, reservedScheduleId: true, reservedChunkIndex: true } });
    if (!plan) return { ok: false, error: "There is no plan to set a weekly time for." };
    const [free, all] = await Promise.all([getReservableSlots(PLAN_CADENCE_CREDITS_PER_WEEK[plan.cadence]), getHoldChoices()]);
    const labelOf = (scheduleId: string, chunkIndex: number) => all.find((c) => c.scheduleId === scheduleId && c.chunkIndex === chunkIndex)?.label ?? null;
    const choices = free.flatMap((s) => {
      const label = labelOf(s.scheduleId, s.chunkIndex);
      return label ? [{ scheduleId: s.scheduleId, chunkIndex: s.chunkIndex, label }] : [];
    });
    return { ok: true, current: plan.reservedScheduleId && plan.reservedChunkIndex !== null ? labelOf(plan.reservedScheduleId, plan.reservedChunkIndex) : null, choices };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

/** Moves the child's standing weekly time (and every upcoming class on it) to another free time. */
export async function parentMoveWeeklyTimeAction(childId: string, scheduleId: string, chunkIndex: number): Promise<{ ok: true } | Fail> {
  try {
    await actingFor(childId);
    await changeReservedSlot(childId, scheduleId, chunkIndex);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}


// ---------------------------------------------------------------------------
// What the Parent mode panel shows
// ---------------------------------------------------------------------------


export interface ParentModeState {
  children: LinkedChild[];
  requests: ParentRequest[];
  parents: { parentId: string; name: string }[];
}

export async function getParentModeStateAction(): Promise<ParentModeState> {
  const user = await requireUser();
  const [children, toMe] = await Promise.all([listLinksFromParent(user.id), listLinksToChild(user.id)]);
  return { children, requests: toMe.requests, parents: toMe.parents };
}

/** A parent ends the plan they pay for. The child keeps the 28 days already paid; nothing is billed after. */
export async function parentEndChildPlanAction(childId: string): Promise<{ ok: true } | Fail> {
  try {
    const { parent, parentName } = await actingFor(childId);
    await cancelPaymentPlanBySelf(childId, "OTHER", `Ended by ${parentName}, who pays for the plan`, { byParentId: parent.id });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

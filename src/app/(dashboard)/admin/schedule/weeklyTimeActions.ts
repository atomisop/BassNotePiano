"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { withStudentNotice } from "@/lib/notifyScope";
import { runOnce } from "@/lib/idempotency";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { ClassBookingError, PlanHoldError, rescheduleClassBooking } from "@/lib/classSchedule";
import { ClassScheduleError, updateClassSchedule, type ClassScheduleInput } from "@/lib/classScheduleManage";
import { PaymentPlanError } from "@/lib/paymentPlans";
import { OFFERED_PLAN_CADENCE, PLAN_CADENCE_CREDITS_PER_WEEK } from "@/lib/classCreditPricing";
import { planSetupTypedSlot, type PlanSetupSlot } from "@/lib/planSetup";
import { moveWeeklyTime, typedWeeklyTimeChoice, type WeeklyTimeChoice } from "@/lib/adminWeeklyTime";
import { checkTypedWeeklyTime, clashRefusal } from "@/lib/weeklyTimeOptions";
import { moveWindowWithEveryone, previewWindowMove, type WindowMovePreview } from "@/lib/weeklyWindowMove";
import { moveClosedDayClasses } from "@/lib/adminClassTools";
import type { DayMove, TypedWeeklyTime } from "@/lib/weeklyTimeRules";

/**
 * Weekly times made, cleared and moved where the owner already is: "Another time…" in the plan tools, moving the class that stands in a
 * weekly time's way, moving a whole window with everyone on it, and moving a closed day's classes instead of canceling them.
 */

// The admin layout only guards pages; Server Actions are their own endpoints, so each one checks here.
async function requireAdmin() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin/schedule");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  return session.user;
}

type Fail = { ok: false; error: string };
const KNOWN = [PaymentPlanError, ClassBookingError, ClassScheduleError];
const failed = (err: unknown, fallback = "Something went wrong. Try again."): Fail => ({ ok: false, error: KNOWN.some((E) => err instanceof E) ? (err as Error).message : fallback });
/** A typed time from the browser, rebuilt from plain values (an action's input is only typed at compile time). */
const typed = (t: unknown): TypedWeeklyTime => {
  const v = (t ?? {}) as { dayOfWeek?: unknown; startTime?: unknown };
  return { dayOfWeek: Number(v.dayOfWeek), startTime: String(v.startTime ?? "") };
};

/** Owner only: "Another time…" in Set up plan. The typed day and start time as a choice, with any class in its way named. */
export async function planSetupTypedTimeAction(userId: string, time: TypedWeeklyTime): Promise<{ ok: true; slot: PlanSetupSlot } | Fail> {
  const admin = await requireAdmin();
  if (!isOwnerEmail(admin.email)) return { ok: false, error: "Only the owner can set up a plan." };
  try {
    return { ok: true, slot: await planSetupTypedSlot(String(userId), typed(time)) };
  } catch (err) {
    return failed(err);
  }
}

export interface TypedBuilderChoice {
  key: string;
  scheduleId: string;
  chunkIndex: number;
  dayOfWeek: number;
  startTime: string;
  label: string;
  newTime: TypedWeeklyTime | null;
}

/** Owner only: "Another time…" in the plan builder. A time with someone else's class on it is refused with who and when. */
export async function planBuilderTypedTimeAction(userId: string, time: TypedWeeklyTime): Promise<{ ok: true; choice: TypedBuilderChoice } | Fail> {
  const admin = await requireAdmin();
  if (!isOwnerEmail(admin.email)) return { ok: false, error: "Only the owner can use the plan builder." };
  try {
    const plan = await prisma.paymentPlan.findFirst({ where: { userId: String(userId), status: "ACTIVE" }, select: { id: true } });
    const option = await checkTypedWeeklyTime(typed(time), { creditsPerWeek: PLAN_CADENCE_CREDITS_PER_WEEK[OFFERED_PLAN_CADENCE], ignoreUserIds: [String(userId)], ignorePlanIds: plan ? [plan.id] : [] });
    if (option.clashes.length > 0) return { ok: false, error: clashRefusal(option.clashes, false) };
    return { ok: true, choice: { key: option.key, scheduleId: option.scheduleId ?? "", chunkIndex: option.chunkIndex, dayOfWeek: option.dayOfWeek, startTime: option.startTime, label: option.label, newTime: option.newTime } };
  } catch (err) {
    return failed(err);
  }
}

/** "Another time…" in Weekly time: the typed time as a choice for this plan. Changes nothing. */
export async function weeklyTimeTypedAction(planId: string, time: TypedWeeklyTime): Promise<{ ok: true; choice: WeeklyTimeChoice } | Fail> {
  await requireAdmin();
  try {
    return { ok: true, choice: await typedWeeklyTimeChoice(String(planId), typed(time)) };
  } catch (err) {
    return failed(err);
  }
}

/** Moves one plan's weekly time to a typed time (a 45 minute window is made for it when there is none) and every upcoming class with it. */
export async function moveWeeklyTimeTypedAction(planId: string, time: TypedWeeklyTime, notify = true): Promise<{ ok: true; label: string } | Fail> {
  return withStudentNotice(notify, async () => {
    const admin = await requireAdmin();
    try {
      const label = await moveWeeklyTime(String(planId), admin.id, { newTime: typed(time) });
      revalidatePath("/", "layout");
      return { ok: true as const, label };
    } catch (err) {
      return failed(err);
    }
  });
}

/**
 * Moves the one class that stands in a weekly time's way ("Move Sam's Dec 2 class"), to the date and start time picked, through the
 * studio's own Reschedule. Every check of a normal move applies: it may not run into another class.
 */
export async function moveClashClassAction(bookingId: string, date: string, time: string, notify = true): Promise<{ ok: true } | (Fail & { planHold?: boolean })> {
  return withStudentNotice(notify, async () => {
    const admin = await requireAdmin();
    try {
      const booking = await prisma.classBooking.findUnique({ where: { id: String(bookingId) }, select: { studentId: true } });
      if (!booking) return { ok: false as const, error: "That class was not found. Refresh and look again." };
      await rescheduleClassBooking(booking.studentId, String(bookingId), "", 0, 0, undefined, { byAdmin: true, customTime: { date: String(date), time: String(time) } });
      await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "booking.move-custom", targetType: "ClassBooking", targetId: String(bookingId), detail: `${date} ${time} ET, to clear a weekly time` });
      revalidatePath("/", "layout");
      return { ok: true as const };
    } catch (err) {
      if (err instanceof PlanHoldError) return { ok: false as const, error: "That time is another student's weekly time. Pick a different one.", planHold: true };
      return failed(err);
    }
  });
}

/** Edits a weekly window. When students are on it the refusal names them, so the screen can link each one and offer "Move everyone with it". */
export async function editWeeklyWindowAction(scheduleId: string, input: ClassScheduleInput): Promise<{ ok: true } | (Fail & { people?: { userId: string; name: string }[] })> {
  await requireAdmin();
  try {
    await updateClassSchedule(String(scheduleId), input);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    if (err instanceof ClassScheduleError) return { ok: false, error: err.message, people: err.people };
    return failed(err);
  }
}

/** What "Move everyone with it" would do: who moves where, and anything in the way. Changes nothing. */
export async function previewWindowMoveAction(scheduleId: string, input: ClassScheduleInput): Promise<{ ok: true; preview: WindowMovePreview } | Fail> {
  await requireAdmin();
  try {
    return { ok: true, preview: await previewWindowMove(String(scheduleId), input) };
  } catch (err) {
    return failed(err);
  }
}

/** Moves a weekly window with everyone on it, once per attempt whatever the taps. Each person is told once when Notify is on. */
export async function moveWindowWithEveryoneAction(scheduleId: string, input: ClassScheduleInput, key?: string, notify = true): Promise<{ ok: true; plans: number; classes: number; to: string } | Fail> {
  return withStudentNotice(notify, async () => {
    const admin = await requireAdmin();
    const result = await runOnce(
      admin.id,
      `move-window:${String(scheduleId)}`,
      key,
      async (): Promise<{ ok: true; plans: number; classes: number; to: string } | Fail> => {
        try {
          return { ok: true as const, ...(await moveWindowWithEveryone(admin.id, String(scheduleId), input)) };
        } catch (err) {
          return failed(err);
        }
      },
      { isSuccess: (r) => r.ok, whileRunning: { ok: false, error: "Already working on it." } },
    );
    revalidatePath("/", "layout");
    return result;
  });
}

/** Close a day, moving its classes instead of canceling them: each to the day and time picked for it. Once per attempt. */
export async function closeDayMovingClassesAction(date: string, reason: string, moves: DayMove[], key?: string, notify = true): Promise<{ ok: true; moved: number; label: string } | Fail> {
  return withStudentNotice(notify, async () => {
    const admin = await requireAdmin();
    const list = Array.isArray(moves) ? moves.slice(0, 200).map((m) => ({ bookingId: String(m?.bookingId ?? ""), date: String(m?.date ?? ""), time: String(m?.time ?? "") })) : [];
    const result = await runOnce(
      admin.id,
      `close-day-move:${String(date)}`,
      key,
      async (): Promise<{ ok: true; moved: number; label: string } | Fail> => {
        try {
          return { ok: true as const, ...(await moveClosedDayClasses(admin.id, admin.email ?? "", String(date), String(reason ?? "").slice(0, 200), list)) };
        } catch (err) {
          return failed(err);
        }
      },
      { isSuccess: (r) => r.ok, whileRunning: { ok: false, error: "Already working on it." } },
    );
    revalidatePath("/", "layout");
    return result;
  });
}

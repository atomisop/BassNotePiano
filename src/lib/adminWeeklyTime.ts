import { prisma } from "@/lib/prisma";
import { PLAN_CADENCE_CREDITS_PER_WEEK } from "@/lib/classCreditPricing";
import { chunksForSchedule, getReservableSlots } from "@/lib/classSchedule";
import { addMinutesToHHmm } from "@/lib/classScheduleLabels";
import { PaymentPlanError, changeReservedSlot } from "@/lib/paymentPlans";
import { logAudit } from "@/lib/audit";

/**
 * "Weekly time" on the student page: the studio moves one person's standing weekly class, and every upcoming class on it, to another
 * free time in one step. Works for any running plan, a person on a group or parent plan included (each has their own weekly time),
 * with no 24 hour cutoff. Later cycles are booked at the new time as they are paid, because the plan's reserved time is what moves.
 */

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

export interface WeeklyTimeChoice {
  scheduleId: string;
  chunkIndex: number;
  dayOfWeek: number;
  /** "Monday 6:00 PM to 6:45 PM". */
  label: string;
}

const CLASS_MINUTES = 45;
const labelFor = (dayOfWeek: number, start: string) => `${DAYS[dayOfWeek]} ${clock(start)} to ${clock(addMinutesToHHmm(start, CLASS_MINUTES))}`;

async function loadPlan(planId: string) {
  const plan = await prisma.paymentPlan.findUnique({ where: { id: planId } });
  if (!plan || plan.status !== "ACTIVE") throw new PaymentPlanError("Only a running plan has a weekly time to move.");
  return plan;
}

/** The plan's current weekly time (null when it has none yet) and every free time it could move to. */
export async function getWeeklyTimeChoices(planId: string): Promise<{ current: WeeklyTimeChoice | null; choices: WeeklyTimeChoice[] }> {
  const plan = await loadPlan(planId);
  const free = await getReservableSlots(PLAN_CADENCE_CREDITS_PER_WEEK[plan.cadence]);
  let current: WeeklyTimeChoice | null = null;
  if (plan.reservedScheduleId && plan.reservedChunkIndex !== null) {
    const schedule = await prisma.classSchedule.findUnique({ where: { id: plan.reservedScheduleId } });
    const chunk = schedule ? chunksForSchedule(schedule)[plan.reservedChunkIndex] : undefined;
    if (schedule && chunk) {
      current = { scheduleId: schedule.id, chunkIndex: plan.reservedChunkIndex, dayOfWeek: schedule.dayOfWeek, label: labelFor(schedule.dayOfWeek, addMinutesToHHmm(schedule.startTime, chunk.offsetMin)) };
    }
  }
  const choices = free
    .filter((s) => !(current && s.scheduleId === current.scheduleId && s.chunkIndex === current.chunkIndex))
    .map((s) => ({ scheduleId: s.scheduleId, chunkIndex: s.chunkIndex, dayOfWeek: s.dayOfWeek, label: labelFor(s.dayOfWeek, s.startTime) }));
  return { current, choices };
}

/** Moves the plan's weekly time and every upcoming class on it. The student is told through changeReservedSlot (muted by the Notify switch). */
export async function moveWeeklyTime(planId: string, adminId: string, scheduleId: string, chunkIndex: number): Promise<string> {
  const plan = await loadPlan(planId);
  const { current, choices } = await getWeeklyTimeChoices(planId);
  const pick = choices.find((c) => c.scheduleId === scheduleId && c.chunkIndex === chunkIndex);
  if (!pick) throw new PaymentPlanError("That time is taken or no longer offered. Pick another.");
  await changeReservedSlot(plan.userId, scheduleId, chunkIndex, { byAdmin: true });
  await logAudit({ actorId: adminId, action: "plan.move-time", targetType: "PaymentPlan", targetId: plan.id, detail: `Weekly time moved from ${current?.label ?? "none"} to ${pick.label}` }).catch(() => undefined);
  return pick.label;
}

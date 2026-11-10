import { prisma } from "@/lib/prisma";
import { chunksForSchedule, classesOverlap, computeScheduledAt, livePaymentPlanConditions, rescheduleClassBooking } from "@/lib/classSchedule";
import { addMinutesToHHmm, formatEtDateTime } from "@/lib/classScheduleLabels";
import { ClassScheduleError, chunkIndexOf, createClassSchedule, resolveDurationMin, resolveSeats, setClassScheduleActive, windowPeople, type ClassScheduleInput } from "@/lib/classScheduleManage";
import { changeReservedSlot } from "@/lib/paymentPlans";
import { withStudentNotice } from "@/lib/notifyScope";
import { createNotification } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { clashSummary, clockLabel, DAY_NAMES, firstNameOf, fitWeeklyTime, matchWindowClasses, sameWeekOn, addDaysYmd, weeklyTimeLabel, shortDay } from "@/lib/weeklyTimeRules";
import { findClashes, windowShapes } from "@/lib/weeklyTimeOptions";

/**
 * "Move everyone with it" on Classes > Schedule > Times: a weekly window that students are on moves to a new day or times in one step.
 * A new window is made, each running plan's weekly time moves to the class at the same place in it (changeReservedSlot, the same move as
 * Weekly time), every other class still to come on it is rescheduled into the same week on the new window, and the old window is turned
 * off. `previewWindowMove` shows exactly that first and names anything in the way; `moveWindowWithEveryone` does it. Each person is told
 * once (with the Notify switch).
 */

export interface WindowMovePreview {
  /** "Tuesday 4:00 PM to 6:00 PM". */
  from: string;
  to: string;
  plans: { userId: string; name: string; from: string; to: string }[];
  classes: { bookingId: string; userId: string; name: string; from: string; to: string }[];
  /** What stands in the way, one plain sentence each. Nothing moves while there is one. */
  problems: string[];
}

const windowLabel = (dayOfWeek: number, startTime: string, durationMin: number) => `${DAY_NAMES[dayOfWeek]} ${clockLabel(startTime)} to ${clockLabel(addMinutesToHHmm(startTime, durationMin))}`;
const ymdOf = (d: Date) => d.toISOString().slice(0, 10);

interface Planned {
  preview: WindowMovePreview;
  old: { id: string; dayOfWeek: number; startTime: string; durationMin: number; label: string | null };
  target: ClassScheduleInput;
  /** A window already made with exactly the new times (a move that stopped half way and is run again): reused, never made twice. */
  existingTargetId: string | null;
  moves: {
    plans: { planId: string; userId: string; running: boolean; chunkIndex: number }[];
    classes: { bookingId: string; userId: string; occurrenceDate: Date; chunkIndex: number; at: Date; fromAt: Date }[];
  };
}

async function plan(scheduleId: string, input: ClassScheduleInput): Promise<Planned> {
  const old = await prisma.classSchedule.findUnique({ where: { id: scheduleId } });
  if (!old) throw new ClassScheduleError("That weekly time was not found.");
  if (!Number.isInteger(input.dayOfWeek) || input.dayOfWeek < 0 || input.dayOfWeek > 6) throw new ClassScheduleError("Pick a day.");
  const durationMin = resolveDurationMin(input.startTime, input.endTime);
  const seats = resolveSeats(input.seats, old.seats);
  if (input.dayOfWeek === old.dayOfWeek && input.startTime === old.startTime && durationMin === old.durationMin) throw new ClassScheduleError("The day and times are the same, so nobody moves.");
  const target = { dayOfWeek: input.dayOfWeek, startTime: input.startTime, durationMin };
  const oldChunks = chunksForSchedule(old);
  const newChunks = chunksForSchedule(target);
  const people = await windowPeople(scheduleId);

  const bookingChunk = new Map(people.bookings.map((b) => [b.id, chunkIndexOf(old, b.occurrenceDate, b.scheduledAt)]));
  const used = [...new Set([...people.plans.map((p) => p.reservedChunkIndex ?? 0), ...bookingChunk.values()])];
  const matched = matchWindowClasses(used, newChunks.length);
  if ("error" in matched) throw new ClassScheduleError(matched.error);

  const problems: string[] = [];
  const existingTarget = await prisma.classSchedule.findFirst({ where: { active: true, id: { not: scheduleId }, dayOfWeek: input.dayOfWeek, startTime: input.startTime, durationMin }, select: { id: true, seats: true } });
  // The new times must not run into another window's class. The old window is being retired, and a window with exactly the new times is a
  // move run again after it stopped half way.
  const shapes = await windowShapes(prisma, input.dayOfWeek);
  const ignore = [scheduleId, ...(existingTarget ? [existingTarget.id] : [])];
  for (const c of newChunks) {
    const start = addMinutesToHHmm(input.startTime, c.offsetMin);
    if (fitWeeklyTime(shapes, { dayOfWeek: input.dayOfWeek, startTime: start }, ignore).kind !== "new") {
      problems.push(`${DAY_NAMES[input.dayOfWeek]} ${clockLabel(start)} is already a class time in another window. Pick other times, or change that window first.`);
      break;
    }
  }

  // A window with the new times that other plans already keep is only free for the people moving while every class has a seat for them.
  const targetSeats = existingTarget ? existingTarget.seats : seats;
  const keptThere = existingTarget
    ? await prisma.paymentPlan.findMany({ where: { reservedScheduleId: existingTarget.id, userId: { notIn: people.plans.map((p) => p.userId) }, OR: livePaymentPlanConditions() }, select: { reservedChunkIndex: true } })
    : [];
  for (const i of used) {
    const arriving = people.plans.filter((p) => (p.reservedChunkIndex ?? 0) === i).length;
    if (keptThere.filter((k) => (k.reservedChunkIndex ?? 0) === i).length + arriving > targetSeats) {
      problems.push("Another plan already keeps one of those new times. Pick other times.");
      break;
    }
  }

  const movingBookingIds = people.bookings.map((b) => b.id);
  const runningPlanIds = new Set(people.plans.filter((p) => p.status === "ACTIVE").map((p) => p.id));
  const plans: Planned["moves"]["plans"] = [];
  const previewPlans: WindowMovePreview["plans"] = [];
  for (const p of people.plans) {
    const i = p.reservedChunkIndex ?? 0;
    const to = addMinutesToHHmm(input.startTime, newChunks[i].offsetMin);
    const name = p.user.name ?? p.user.email;
    plans.push({ planId: p.id, userId: p.userId, running: p.status === "ACTIVE", chunkIndex: i });
    previewPlans.push({ userId: p.userId, name, from: weeklyTimeLabel(old.dayOfWeek, addMinutesToHHmm(old.startTime, oldChunks[i]?.offsetMin ?? 0)), to: weeklyTimeLabel(input.dayOfWeek, to) });
    const clashes = await findClashes(prisma, { scheduleId: existingTarget?.id ?? null, dayOfWeek: input.dayOfWeek, startTime: to }, { ignoreUserIds: [p.userId], ignoreBookingIds: movingBookingIds });
    if (clashes.length > 0) problems.push(`${firstNameOf(p.user.name, p.user.email)}'s new weekly time runs into a class (${clashSummary(clashes)}). Move that class first.`);
  }

  // A running plan's own classes are laid again by its weekly time move; every other class is rescheduled into the same week on the new day.
  const classes: Planned["moves"]["classes"] = [];
  const previewClasses: WindowMovePreview["classes"] = [];
  const now = Date.now();
  for (const b of people.bookings) {
    if (b.reservedByPlanId && runningPlanIds.has(b.reservedByPlanId)) continue;
    const i = bookingChunk.get(b.id) ?? 0;
    let ymd = sameWeekOn(ymdOf(b.occurrenceDate), old.dayOfWeek, input.dayOfWeek);
    let at = computeScheduledAt(target, new Date(`${ymd}T00:00:00Z`), newChunks[i]);
    if (at.getTime() <= now) {
      ymd = addDaysYmd(ymd, 7);
      at = computeScheduledAt(target, new Date(`${ymd}T00:00:00Z`), newChunks[i]);
    }
    const name = b.student.name ?? b.student.email;
    const first = firstNameOf(b.student.name, b.student.email);
    classes.push({ bookingId: b.id, userId: b.studentId, occurrenceDate: new Date(`${ymd}T00:00:00Z`), chunkIndex: i, at, fromAt: b.scheduledAt });
    previewClasses.push({ bookingId: b.id, userId: b.studentId, name, from: b.scheduledAt.toISOString(), to: at.toISOString() });
    const [sameDay, overlap] = await Promise.all([
      prisma.classBooking.findFirst({ where: { studentId: b.studentId, occurrenceDate: new Date(`${ymd}T00:00:00Z`), status: "SCHEDULED", id: { notIn: movingBookingIds } }, select: { id: true } }),
      prisma.classBooking.findFirst({
        where: { status: "SCHEDULED", id: { notIn: movingBookingIds }, scheduledAt: { gt: new Date(at.getTime() - 45 * 60_000), lt: new Date(at.getTime() + 45 * 60_000) } },
        select: { scheduledAt: true, student: { select: { name: true, email: true } } },
      }),
    ]);
    if (sameDay) problems.push(`${first} already has a class on ${shortDay(ymd)}, so their ${shortDay(ymdOf(b.occurrenceDate))} class cannot move there. Move or cancel one of them first.`);
    else if (overlap && classesOverlap(overlap.scheduledAt, at)) problems.push(`${first}'s ${shortDay(ymdOf(b.occurrenceDate))} class would run into ${firstNameOf(overlap.student.name, overlap.student.email)}'s class on ${shortDay(ymd)}. Move one of them first.`);
  }

  return {
    preview: {
      from: windowLabel(old.dayOfWeek, old.startTime, old.durationMin),
      to: windowLabel(input.dayOfWeek, input.startTime, durationMin),
      plans: previewPlans,
      classes: previewClasses,
      problems,
    },
    old: { id: old.id, dayOfWeek: old.dayOfWeek, startTime: old.startTime, durationMin: old.durationMin, label: old.label },
    target: { ...input, seats },
    existingTargetId: existingTarget?.id ?? null,
    moves: { plans, classes },
  };
}

/** What moving the window would do, and what is in the way. Changes nothing. */
export async function previewWindowMove(scheduleId: string, input: ClassScheduleInput): Promise<WindowMovePreview> {
  return (await plan(scheduleId, input)).preview;
}

/**
 * Moves the window with everyone on it. Stops at the first thing that cannot move and says what; whatever already moved stays moved and
 * the old window stays on, so running it again (after fixing that one) finishes the job on the same new window.
 */
export async function moveWindowWithEveryone(adminId: string, scheduleId: string, input: ClassScheduleInput): Promise<{ plans: number; classes: number; to: string }> {
  const planned = await plan(scheduleId, input);
  if (planned.preview.problems.length > 0) throw new ClassScheduleError(planned.preview.problems[0]);
  const targetId = planned.existingTargetId ?? (await createClassSchedule(planned.target)).id;

  const told = new Map<string, { weekly: string | null; classes: string[] }>();
  const tell = (userId: string) => told.get(userId) ?? told.set(userId, { weekly: null, classes: [] }).get(userId)!;
  const total = planned.moves.plans.length + planned.moves.classes.length;
  let done = 0;

  // Each step tells nobody; one notice per person follows, under the caller's Notify switch. The first step that fails stops the rest.
  const failure = await withStudentNotice(false, async (): Promise<string | null> => {
    for (const p of planned.moves.plans) {
      const row = planned.preview.plans.find((x) => x.userId === p.userId);
      try {
        if (p.running) await changeReservedSlot(p.userId, targetId, p.chunkIndex, { byAdmin: true });
        else await prisma.paymentPlan.update({ where: { id: p.planId }, data: { reservedScheduleId: targetId, reservedChunkIndex: p.chunkIndex } });
      } catch (err) {
        return `${row?.name ?? "A student"}: ${err instanceof Error ? err.message : "could not move"}`;
      }
      tell(p.userId).weekly = row?.to ?? null;
      done += 1;
    }
    for (const c of planned.moves.classes) {
      try {
        await rescheduleClassBooking(c.userId, c.bookingId, targetId, c.occurrenceDate.getTime(), c.chunkIndex, undefined, { byAdmin: true, overridePlanHold: true });
      } catch (err) {
        const name = planned.preview.classes.find((x) => x.bookingId === c.bookingId)?.name ?? "A student";
        return `${name}'s ${formatEtDateTime(c.fromAt)} class: ${err instanceof Error ? err.message : "could not move"}`;
      }
      tell(c.userId).classes.push(`${formatEtDateTime(c.fromAt)} is now ${formatEtDateTime(c.at)}`);
      done += 1;
    }
    return null;
  });

  for (const [userId, what] of told) {
    const body = [
      `The studio moved its ${planned.preview.from} classes to ${planned.preview.to}.`,
      what.weekly ? `Your weekly class is now ${what.weekly}, and your upcoming classes moved with it.` : "",
      what.classes.length > 0 ? `Your class on ${what.classes.join("; ")}.` : "",
      "No credits were charged.",
    ]
      .filter(Boolean)
      .join(" ");
    await createNotification({ userId, type: "RESERVED_SLOT_CHANGED", title: "Your class time moved", body, emailCategory: "classes", cta: { label: "See your classes", path: "/lessons" } }).catch(() => undefined);
  }

  if (failure) {
    await logAudit({ actorId: adminId, action: "schedule.move-window", targetType: "ClassSchedule", targetId: scheduleId, detail: `Stopped after ${done} of ${total}: ${planned.preview.from} to ${planned.preview.to}` });
    throw new ClassScheduleError(`Moved ${done} of ${total}. ${failure} The old time is still on, so nothing is lost: fix that and press Move again.`);
  }

  await setClassScheduleActive(scheduleId, false);
  await logAudit({
    actorId: adminId,
    action: "schedule.move-window",
    targetType: "ClassSchedule",
    targetId: scheduleId,
    detail: `${planned.preview.from} to ${planned.preview.to}: ${planned.moves.plans.length} weekly plan(s), ${planned.moves.classes.length} class(es) moved`,
  });
  return { plans: planned.moves.plans.length, classes: planned.moves.classes.length, to: planned.preview.to };
}

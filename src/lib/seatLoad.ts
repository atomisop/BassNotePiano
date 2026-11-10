import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { livePaymentPlanConditions } from "@/lib/planLive";
import { planHoldsOccurrence } from "@/lib/planHold";
import { countSeatUnits, holderUnit, type SeatBooking, type SeatHolder } from "@/lib/seatRules";

export { countSeatUnits as seatUnits };

export interface SeatLoad {
  /** Seats used by SCHEDULED classes at this exact instant. */
  booked: number;
  /** Seats kept by live weekly plans that have no class there yet. */
  held: number;
  taken: number;
}

export interface SeatLoadArgs {
  scheduleId: string;
  chunkIndex: number;
  occurrenceDate: Date;
  scheduledAt: Date;
  /**
   * Count every live plan keeping the time, even in a week it is not using (before its first class, a skipped week). bookClass and
   * Reschedule have always refused those, so they pass true; the open-times list and a plan's own booking use the week-aware rule.
   */
  strictHolders?: boolean;
  /** Leave these students (their classes and their plans) out: the person being booked or moved. */
  ignoreStudentIds?: string[];
  ignorePlanIds?: string[];
  /** Leave out one weekly plan group (its members share a class). */
  ignoreGroupId?: string | null;
}

/** How many seats of one slot occurrence are used, by the one seat rule (see seatRules.ts). */
export async function loadSeatLoad(db: Prisma.TransactionClient | typeof prisma, a: SeatLoadArgs): Promise<SeatLoad> {
  const ignoreStudents = a.ignoreStudentIds ?? [];
  const ignorePlans = a.ignorePlanIds ?? [];
  const [rows, plans] = await Promise.all([
    db.classBooking.findMany({
      where: {
        scheduleId: a.scheduleId,
        occurrenceDate: a.occurrenceDate,
        scheduledAt: a.scheduledAt,
        status: "SCHEDULED",
        ...(ignoreStudents.length > 0 ? { studentId: { notIn: ignoreStudents } } : {}),
      },
      select: { studentId: true, familyBookingGroupId: true, reservedByPlanId: true },
    }),
    db.paymentPlan.findMany({
      where: {
        reservedScheduleId: a.scheduleId,
        reservedChunkIndex: a.chunkIndex,
        ...(ignorePlans.length > 0 ? { id: { notIn: ignorePlans } } : {}),
        ...(ignoreStudents.length > 0 ? { userId: { notIn: ignoreStudents } } : {}),
        OR: livePaymentPlanConditions(),
      },
      select: { userId: true, familyGroupId: true, reservedBookings: { select: { occurrenceDate: true, status: true } } },
    }),
  ]);
  const bookings: SeatBooking[] = a.ignoreGroupId ? rows.filter((r) => !(r.reservedByPlanId && r.familyBookingGroupId === a.ignoreGroupId)) : rows;
  const holders: SeatHolder[] = plans
    .filter((p) => (a.strictHolders || planHoldsOccurrence(p.reservedBookings, a.occurrenceDate)) && !(a.ignoreGroupId && p.familyGroupId === a.ignoreGroupId))
    .map((p) => ({ userId: p.userId, familyGroupId: p.familyGroupId }));
  return countSeatUnits(bookings, holders);
}

/** Live weekly plans keeping a time (holders only, any week), for the checks that ask "may one more plan hold this time". */
export async function countLivePlanHolders(
  db: Prisma.TransactionClient | typeof prisma,
  scheduleId: string,
  chunkIndex: number,
  ignore: { planIds?: string[]; userIds?: string[] } = {},
): Promise<number> {
  const plans = await db.paymentPlan.findMany({
    where: {
      reservedScheduleId: scheduleId,
      reservedChunkIndex: chunkIndex,
      ...(ignore.planIds?.length ? { id: { notIn: ignore.planIds } } : {}),
      ...(ignore.userIds?.length ? { userId: { notIn: ignore.userIds } } : {}),
      OR: livePaymentPlanConditions(),
    },
    select: { userId: true, familyGroupId: true },
  });
  return new Set(plans.map((p) => holderUnit(p))).size;
}

/**
 * The first of these upcoming instants where a weekly time is already full without the people being moved onto it, or null.
 * Used before a plan takes the time: other live plans keeping it plus other students' classes there must leave one seat.
 */
export async function findFullInstant(
  db: Prisma.TransactionClient | typeof prisma,
  a: {
    scheduleId: string;
    chunkIndex: number;
    seats: number;
    instants: { occurrenceDate: Date; scheduledAt: Date }[];
    ignoreStudentIds?: string[];
    ignorePlanIds?: string[];
  },
): Promise<{ occurrenceDate: Date; scheduledAt: Date } | null> {
  if (a.instants.length === 0) return null;
  const ignoreStudents = a.ignoreStudentIds ?? [];
  const ignorePlans = a.ignorePlanIds ?? [];
  const [rows, plans] = await Promise.all([
    db.classBooking.findMany({
      where: {
        scheduleId: a.scheduleId,
        status: "SCHEDULED",
        ...(ignoreStudents.length > 0 ? { studentId: { notIn: ignoreStudents } } : {}),
        OR: a.instants.map((i) => ({ occurrenceDate: i.occurrenceDate, scheduledAt: i.scheduledAt })),
      },
      select: { studentId: true, familyBookingGroupId: true, reservedByPlanId: true, scheduledAt: true },
    }),
    db.paymentPlan.findMany({
      where: {
        reservedScheduleId: a.scheduleId,
        reservedChunkIndex: a.chunkIndex,
        ...(ignorePlans.length > 0 ? { id: { notIn: ignorePlans } } : {}),
        ...(ignoreStudents.length > 0 ? { userId: { notIn: ignoreStudents } } : {}),
        OR: livePaymentPlanConditions(),
      },
      select: { userId: true, familyGroupId: true, reservedBookings: { select: { occurrenceDate: true, status: true } } },
    }),
  ]);
  for (const i of a.instants) {
    const here = rows.filter((r) => r.scheduledAt.getTime() === i.scheduledAt.getTime());
    const holders = plans.filter((p) => planHoldsOccurrence(p.reservedBookings, i.occurrenceDate)).map((p) => ({ userId: p.userId, familyGroupId: p.familyGroupId }));
    if (countSeatUnits(here, holders).taken >= a.seats) return i;
  }
  return null;
}

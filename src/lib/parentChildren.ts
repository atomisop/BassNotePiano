import { prisma } from "@/lib/prisma";
import { assertParentOf } from "@/lib/parentLinks";
import { getRoadmap } from "@/lib/access";
import { getStudentPracticeDetail, type StudentPracticeDetail } from "@/lib/practiceActivity";
import { describeReservedSlot } from "@/lib/paymentPlans";
import { describePaymentPlan, creditsLabelFromStored } from "@/lib/classCreditPricing";

export interface ChildClass {
  id: string;
  scheduledAt: string;
  label: string | null;
  status: "SCHEDULED" | "COMPLETED" | "CANCELED";
  attended: boolean | null;
}

export interface ChildScaleRow {
  slug: string;
  code: string;
  title: string;
  locked: boolean;
  moduleRead: boolean;
  practiceCompleted: boolean;
  quizPassed: boolean;
  quizScore: number | null;
}

export interface ChildView {
  id: string;
  name: string;
  email: string;
  plan: { name: string; billsPaid: number; billsTotal: number; weeklyTime: string | null; nextBillOn: string; paused: boolean } | null;
  creditsLabel: string;
  upcoming: ChildClass[];
  recent: ChildClass[];
  practice: StudentPracticeDetail;
  scales: ChildScaleRow[];
  /** True when the plan holds a weekly time, so the parent can move it. */
  canMoveWeeklyTime: boolean;
}

/** Everything a parent sees about one linked child. Throws unless the link is accepted. */
export async function getChildView(parentId: string, childId: string): Promise<ChildView> {
  await assertParentOf(parentId, childId);
  const now = new Date();
  const [user, plan, bookings, practice, roadmap] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: childId }, select: { id: true, name: true, email: true, classCredits: true } }),
    prisma.paymentPlan.findFirst({ where: { userId: childId, status: "ACTIVE" }, orderBy: { createdAt: "desc" } }),
    prisma.classBooking.findMany({ where: { studentId: childId }, include: { schedule: { select: { label: true } } }, orderBy: { scheduledAt: "desc" }, take: 40 }),
    getStudentPracticeDetail(childId),
    getRoadmap(childId),
  ]);
  const toRow = (b: (typeof bookings)[number]): ChildClass => ({
    id: b.id,
    scheduledAt: b.scheduledAt.toISOString(),
    label: b.schedule.label,
    status: b.status === "CANCELED" ? "CANCELED" : b.status === "COMPLETED" ? "COMPLETED" : "SCHEDULED",
    attended: b.attendance === null ? null : b.attendance === "PRESENT",
  });
  const upcoming = bookings.filter((b) => b.status === "SCHEDULED" && b.scheduledAt > now).sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()).map(toRow);
  const recent = bookings.filter((b) => b.status === "COMPLETED" || (b.status === "SCHEDULED" && b.scheduledAt <= now)).slice(0, 8).map(toRow);
  const weeklyTime = plan ? await describeReservedSlot(plan.id) : null;
  return {
    id: user.id,
    name: user.name ?? user.email,
    email: user.email,
    plan: plan
      ? {
          name: describePaymentPlan(plan.cadence, plan.term),
          billsPaid: plan.installmentsPaid,
          billsTotal: plan.termMonths,
          weeklyTime,
          nextBillOn: plan.nextDueDate.toISOString(),
          paused: Boolean(plan.pausedAt && plan.pauseUntil && plan.pauseUntil > now),
        }
      : null,
    creditsLabel: creditsLabelFromStored(user.classCredits),
    upcoming,
    recent,
    practice,
    scales: roadmap.map((s) => ({
      slug: s.scaleGroup.slug,
      code: s.scaleGroup.code,
      title: s.scaleGroup.kinitName ?? s.scaleGroup.title,
      locked: s.status === "LOCKED" || !s.canAccess,
      moduleRead: s.moduleRead,
      practiceCompleted: s.practiceCompleted,
      quizPassed: s.quizPassed,
      quizScore: s.quizScore,
    })),
    canMoveWeeklyTime: Boolean(plan?.reservedScheduleId),
  };
}

export interface ChildSummary {
  childId: string;
  name: string;
  email: string;
  streak: number;
  doneLast7: number;
  nextClass: string | null;
  planName: string | null;
  scalesOpen: number;
  scalesDone: number;
}

/** One line of facts per accepted child, for the Parent mode list. */
export async function listChildSummaries(parentId: string): Promise<ChildSummary[]> {
  const links = await prisma.parentLink.findMany({ where: { parentId, status: "ACCEPTED" }, include: { child: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } });
  return Promise.all(
    links.map(async ({ child }) => {
      const [practice, plan, next, roadmap] = await Promise.all([
        getStudentPracticeDetail(child.id),
        prisma.paymentPlan.findFirst({ where: { userId: child.id, status: "ACTIVE" }, select: { cadence: true, term: true } }),
        prisma.classBooking.findFirst({ where: { studentId: child.id, status: "SCHEDULED", scheduledAt: { gt: new Date() } }, orderBy: { scheduledAt: "asc" }, select: { scheduledAt: true } }),
        getRoadmap(child.id),
      ]);
      return {
        childId: child.id,
        name: child.name ?? child.email,
        email: child.email,
        streak: practice.streak,
        doneLast7: practice.doneLast7,
        nextClass: next?.scheduledAt.toISOString() ?? null,
        planName: plan ? describePaymentPlan(plan.cadence, plan.term) : null,
        scalesOpen: roadmap.filter((s) => s.canAccess).length,
        scalesDone: roadmap.filter((s) => s.quizPassed).length,
      };
    }),
  );
}

export interface ParentBill {
  paymentId: string;
  /** The children this payment covers (a first payment can cover several). */
  childIds: string[];
  childName: string;
  label: string;
  status: "AWAITING_TRANSFER" | "PENDING_REVIEW" | "REJECTED";
  rejectionReason: string | null;
  amountCents: number;
  planName: string;
}

/** What the parent still has to pay for children's plans they pay for: the combined first payment of a new plan, and each 28-day bill. */
export async function listParentBills(parentId: string, zelleHandle: string): Promise<ParentBill[]> {
  const { getOrCreateOpenInstallmentPayment } = await import("@/lib/paymentPlans");
  const groups = await prisma.familyPlanGroup.findMany({
    where: { payerId: parentId, kind: "PARENT" },
    include: { plans: { where: { status: "ACTIVE" }, include: { user: { select: { name: true, email: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  const bills: ParentBill[] = [];
  for (const group of groups) {
    const started = group.plans.some((p) => p.installmentsPaid > 0);
    if (!started) {
      const start = await prisma.zellePayment.findFirst({
        where: { familyGroupId: group.id, purpose: "FAMILY_PLAN_START", status: { in: ["AWAITING_TRANSFER", "PENDING_REVIEW", "REJECTED"] } },
        orderBy: { createdAt: "desc" },
      });
      if (start && group.plans.length > 0) {
        bills.push({
          paymentId: start.id,
          childIds: group.plans.map((p) => p.userId),
          childName: group.plans.map((p) => p.user.name ?? p.user.email).join(", "),
          label: "First payment",
          status: start.status as ParentBill["status"],
          rejectionReason: start.rejectionReason,
          amountCents: start.amountCents,
          planName: describePaymentPlan(group.plans[0].cadence, group.plans[0].term),
        });
      }
      continue;
    }
    for (const plan of group.plans) {
      if (plan.userId === parentId) continue; // the parent's own bill is on their own Billing page
      const { payment } = await getOrCreateOpenInstallmentPayment(plan.id, zelleHandle);
      if (payment) {
        bills.push({
          paymentId: payment.id,
          childIds: [plan.userId],
          childName: plan.user.name ?? plan.user.email,
          label: `28-day bill ${payment.installmentNumber ?? ""}`.trim(),
          status: payment.status as ParentBill["status"],
          rejectionReason: payment.rejectionReason,
          amountCents: payment.amountCents,
          planName: describePaymentPlan(plan.cadence, plan.term),
        });
      }
    }
  }
  return bills;
}

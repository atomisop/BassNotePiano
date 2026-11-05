// ============================================================================
// The admin "customer profile" page, one consolidated view of a single
// student's account, curriculum progress, payments, credits/bookings, and
// support history, plus a reconstructed activity timeline across all of it.
//
// Built by direct instruction: a student emailing about anything used to
// mean clicking through several separate admin pages (payments, credits,
// bookings, users) to piece their situation together. Every read here
// reuses an already-tested function or model from elsewhere in the
// codebase (getRoadmap, getUserPaymentHistory, getUserClassBookings,
// getSupportThreads) rather than re-querying the same tables a second,
// slightly different way.
//
// Deliberately does NOT surface this student's private Messages with other
// students, that's a second person's privacy, not just this account's,
// and reading it isn't something a "look up one student" tool should
// casually expose. Support/Atom conversations are included: the admin is
// already a real party to those.
//
// Also deliberately has no delete-this-account action anywhere on this
// page. Every action here is reversible (grant/revoke, lock/unlock,
// credit up/down, cancel a booking); permanent deletion is the one thing
// that isn't, by direct instruction, so it stays out of "quick actions"
// entirely rather than getting a button with a confirm dialog.
// ============================================================================

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getRoadmap, type ScaleAccessState } from "@/lib/access";
import { getUserPaymentHistory, type UserPaymentRecord } from "@/lib/payments";
import { getUserClassBookings } from "@/lib/classSchedule";
import { getSupportThreads, type AdminThreadSummary } from "@/lib/support";
import { getUserCreditHistory, type CreditAdjustmentRow } from "@/lib/creditAdjustments";
import { getStudentPracticeDetail, type StudentPracticeDetail } from "@/lib/practiceActivity";

const scaleProgressWithGroupInclude = {
  scaleGroup: { select: { code: true, kinitName: true, title: true } },
} satisfies Prisma.ScaleProgressInclude;

type ScaleProgressWithGroup = Prisma.ScaleProgressGetPayload<{ include: typeof scaleProgressWithGroupInclude }>;

export interface CustomerActivityEvent {
  at: Date;
  label: string;
  detail: string | null;
}

export interface CustomerProfile {
  user: {
    id: string;
    name: string | null;
    email: string;
    username: string | null;
    image: string | null;
    role: "STUDENT" | "ADMIN";
    emailVerified: Date | null;
    phone: string | null;
    phoneVerifiedAt: Date | null;
    passwordChangedAt: Date | null;
    createdAt: Date;
    classCredits: number;
    hasCurriculumAccess: boolean;
    primaryInstrument: string | null;
    currentStreak: number;
    lastActivityAt: Date | null;
    bannedAt: Date | null;
    bannedReason: string | null;
  };
  roadmap: ScaleAccessState[];
  payments: UserPaymentRecord[];
  /** Other names this student's payments arrive under, saved when an admin attached a bank email by hand. */
  payerAliases: { id: string; name: string }[];
  bookings: Awaited<ReturnType<typeof getUserClassBookings>>;
  supportThreads: AdminThreadSummary[];
  creditHistory: CreditAdjustmentRow[];
  /** Daily finger practice, last 30 days. */
  practice: StudentPracticeDetail;
  timeline: CustomerActivityEvent[];
}

export async function getCustomerProfile(userId: string): Promise<CustomerProfile | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      image: true,
      role: true,
      emailVerified: true,
      phone: true,
      phoneVerifiedAt: true,
      passwordChangedAt: true,
      createdAt: true,
      classCredits: true,
      hasCurriculumAccess: true,
      primaryInstrument: true,
      currentStreak: true,
      lastActivityDate: true,
      bannedAt: true,
      bannedReason: true,
    },
  });
  if (!user) return null;

  const [roadmap, scaleProgressRows, payments, payerAliases, bookings, supportThreads, creditHistory, practice] = await Promise.all([
    getRoadmap(userId),
    // getRoadmap's own ScaleAccessState is a processed *current* snapshot
    // (status/canAccess), not the raw timestamps a timeline needs, pulled
    // separately here rather than added to that shared type, which every
    // other caller (the dashboard, the roadmap page) has no use for.
    prisma.scaleProgress.findMany({ where: { userId }, include: scaleProgressWithGroupInclude }),
    getUserPaymentHistory(userId),
    prisma.payerAlias.findMany({ where: { userId }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
    getUserClassBookings(userId),
    getSupportThreads(undefined, userId),
    getUserCreditHistory(userId, 100),
    getStudentPracticeDetail(userId),
  ]);

  const timeline = buildTimeline({ scaleProgressRows, payments, bookings, supportThreads, creditHistory });

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      image: user.image,
      role: user.role,
      emailVerified: user.emailVerified,
      phone: user.phone,
      phoneVerifiedAt: user.phoneVerifiedAt,
      passwordChangedAt: user.passwordChangedAt,
      createdAt: user.createdAt,
      classCredits: user.classCredits,
      hasCurriculumAccess: user.hasCurriculumAccess,
      primaryInstrument: user.primaryInstrument,
      currentStreak: user.currentStreak,
      lastActivityAt: user.lastActivityDate,
      bannedAt: user.bannedAt,
      bannedReason: user.bannedReason,
    },
    roadmap,
    payments,
    payerAliases,
    bookings,
    supportThreads,
    creditHistory,
    practice,
    timeline,
  };
}

function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function buildTimeline(data: {
  scaleProgressRows: ScaleProgressWithGroup[];
  payments: UserPaymentRecord[];
  bookings: Awaited<ReturnType<typeof getUserClassBookings>>;
  supportThreads: AdminThreadSummary[];
  creditHistory: CreditAdjustmentRow[];
}): CustomerActivityEvent[] {
  const events: CustomerActivityEvent[] = [];

  for (const p of data.payments) {
    events.push({
      at: p.createdAt,
      label: "Payment submitted",
      detail: `${formatUsd(p.amountCents)} · ${p.purpose.replace(/_/g, " ").toLowerCase()}`,
    });
    if (p.reviewedAt) {
      events.push({
        at: p.reviewedAt,
        label: p.status === "VERIFIED" ? "Payment verified" : p.status === "REJECTED" ? "Payment rejected" : "Payment reviewed",
        detail: p.rejectionReason ?? `${formatUsd(p.amountCents)} · ${p.purpose.replace(/_/g, " ").toLowerCase()}`,
      });
    }
  }

  for (const b of data.bookings) {
    events.push({
      at: b.createdAt,
      label: "Class booked",
      detail: `${b.schedule.label ?? "Class"} · ${b.scheduledAt.toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET`,
    });
    if (b.status === "CANCELED") {
      events.push({
        at: b.updatedAt,
        label: "Booking canceled",
        detail: b.canceledReason ?? (b.refunded ? "Refunded" : null),
      });
    }
  }

  for (const sp of data.scaleProgressRows) {
    const name = sp.scaleGroup.kinitName ?? sp.scaleGroup.title;
    if (sp.unlockedAt) events.push({ at: sp.unlockedAt, label: `${sp.scaleGroup.code} unlocked`, detail: name });
    if (sp.moduleReadAt) events.push({ at: sp.moduleReadAt, label: `${sp.scaleGroup.code} module read`, detail: name });
    if (sp.practiceCompletedAt) events.push({ at: sp.practiceCompletedAt, label: `${sp.scaleGroup.code} practice logged`, detail: name });
    if (sp.quizPassedAt) {
      events.push({
        at: sp.quizPassedAt,
        label: `${sp.scaleGroup.code} quiz passed`,
        detail: sp.quizScore !== null ? `Scored ${sp.quizScore}` : name,
      });
    }
    if (sp.completedAt) events.push({ at: sp.completedAt, label: `${sp.scaleGroup.code} completed`, detail: name });
  }

  for (const t of data.supportThreads) {
    events.push({ at: t.createdAt, label: "Support conversation started", detail: t.lastMessage?.body.slice(0, 80) ?? null });
  }

  for (const c of data.creditHistory) {
    const magnitude = Math.abs(c.amount);
    events.push({
      at: c.createdAt,
      label: `${c.amount > 0 ? "+" : "−"}${magnitude} credit${magnitude === 1 ? "" : "s"} (admin)`,
      detail: `${c.reasonNote}, ${c.adjustedBy.name ?? c.adjustedBy.email}`,
    });
  }

  return events.sort((a, b) => b.at.getTime() - a.at.getTime());
}

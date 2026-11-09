import { prisma } from "@/lib/prisma";
import { paymentReferenceCode } from "@/lib/paymentReference";
import { getNextScales, type NextScaleInfo } from "@/lib/nextScaleSummary";

/**
 * What the support thread's side panel shows for the account a chat belongs to, so the problem the person wrote about can be fixed
 * right there: their open bills and payments waiting for review, their next classes, and their next scale.
 */
export interface SupportAccountExtras {
  payments: {
    id: string;
    amountCents: number;
    purpose: string;
    status: "AWAITING_TRANSFER" | "PENDING_REVIEW" | "REJECTED";
    code: string;
    submittedAt: string | null;
  }[];
  classes: { id: string; scheduledAt: string; label: string | null; inPerson: boolean }[];
  nextScale: NextScaleInfo | null;
}

export async function getSupportAccountExtras(userId: string, now = new Date()): Promise<SupportAccountExtras> {
  const [payments, classes, scales] = await Promise.all([
    prisma.zellePayment.findMany({
      // A member's bill held inside a group's combined bill is paid (and approved) through the combined one, so it is left out here.
      where: { userId, bundleId: null, status: { in: ["AWAITING_TRANSFER", "PENDING_REVIEW", "REJECTED"] } },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: { id: true, amountCents: true, purpose: true, status: true, submittedAt: true },
    }),
    prisma.classBooking.findMany({
      where: { studentId: userId, status: "SCHEDULED", scheduledAt: { gt: new Date(now.getTime() - 45 * 60_000) } },
      orderBy: { scheduledAt: "asc" },
      take: 4,
      select: { id: true, scheduledAt: true, inPerson: true, schedule: { select: { label: true } } },
    }),
    getNextScales([userId]),
  ]);
  return {
    payments: payments.map((p) => ({
      id: p.id,
      amountCents: p.amountCents,
      purpose: p.purpose,
      status: p.status as "AWAITING_TRANSFER" | "PENDING_REVIEW" | "REJECTED",
      code: paymentReferenceCode(p.id),
      submittedAt: p.submittedAt ? p.submittedAt.toISOString() : null,
    })),
    classes: classes.map((c) => ({ id: c.id, scheduledAt: c.scheduledAt.toISOString(), label: c.schedule.label, inPerson: c.inPerson })),
    nextScale: scales.get(userId) ?? null,
  };
}

/** The open chat to go to after this one is answered: the one waiting longest, from the same inbox (chat or email). */
export async function findNextOpenThread(currentId: string): Promise<{ id: string; name: string } | null> {
  const current = await prisma.assistantEscalation.findUnique({ where: { id: currentId }, select: { source: true } });
  if (!current) return null;
  const next = await prisma.assistantEscalation.findFirst({
    where: { status: "OPEN", source: current.source, id: { not: currentId } },
    orderBy: { createdAt: "asc" },
    select: { id: true, contactName: true, contactEmail: true, user: { select: { name: true } } },
  });
  return next ? { id: next.id, name: next.user?.name ?? next.contactName ?? next.contactEmail } : null;
}

import { prisma } from "@/lib/prisma";
import { getAdminProgressOverview } from "@/lib/admin";
import { paymentReferenceCode } from "@/lib/paymentReference";
import { etDayKey } from "@/lib/fingerPractice";
import { needsYouRowSpec, type NeedsYouItem, type NeedsYouKind } from "@/lib/needsYou";

/**
 * The first few things behind one "Needs you" row on the Overview, each with its main action, so the row can open in place and the
 * job is done without leaving the Overview. Read only when a row is opened. The actions themselves are the existing ones (approve a
 * payment, mark a class, release a scale...), called by the screen.
 */

const ET = "America/New_York";
const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const when = (d: Date) => d.toLocaleString("en-US", { timeZone: ET, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const dateOnly = (d: Date) => d.toLocaleDateString("en-US", { timeZone: ET, month: "short", day: "numeric" });
const who = (u: { name: string | null; email: string }) => u.name ?? u.email;

const PURPOSE: Record<string, string> = {
  PAYMENT_PLAN_INSTALLMENT: "Plan bill",
  FAMILY_PLAN_START: "Group first payment",
  FAMILY_PLAN_INSTALLMENT: "Group bill",
  CLASS_CREDITS: "Class credits",
  FAMILY_BUNDLE: "Family credits",
  CURRICULUM: "Curriculum",
  CURRICULUM_FAMILY_BUNDLE: "Family curriculum",
  SCALE_UNLOCK: "Scale",
};

export async function getNeedsYouItems(kind: NeedsYouKind, opts: { isOwner: boolean; take?: number; now?: Date }): Promise<NeedsYouItem[]> {
  const take = opts.take ?? 3;
  const now = opts.now ?? new Date();
  if (!needsYouRowSpec(kind)?.expandable) return [];

  switch (kind) {
    case "payments": {
      const rows = await prisma.zellePayment.findMany({
        where: { status: "PENDING_REVIEW", bundleId: null },
        orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }],
        take,
        select: { id: true, amountCents: true, purpose: true, submittedAt: true, user: { select: { name: true, email: true } } },
      });
      return rows.map((p) => ({
        key: p.id,
        title: `${who(p.user)}, ${money(p.amountCents)}`,
        detail: [PURPOSE[p.purpose] ?? "Payment", paymentReferenceCode(p.id), p.submittedAt ? `sent ${dateOnly(p.submittedAt)}` : null].filter(Boolean).join(" · "),
        href: `/admin/payments?id=${p.id}`,
        // Approving gives value away: the owner only, as on Billing > Payments.
        action: opts.isOwner ? { kind: "approvePayment", id: p.id } : null,
      }));
    }
    case "unchecked": {
      const rows = await prisma.zellePayment.findMany({
        where: { autoApproved: true, checkedAt: null, status: "VERIFIED", bundleId: null },
        orderBy: { reviewedAt: "asc" },
        take,
        select: { id: true, amountCents: true, purpose: true, reviewedAt: true, matchedVia: true, user: { select: { name: true, email: true } } },
      });
      return rows.map((p) => ({
        key: p.id,
        title: `${who(p.user)}, ${money(p.amountCents)}`,
        detail: [PURPOSE[p.purpose] ?? "Payment", p.reviewedAt ? `approved ${dateOnly(p.reviewedAt)}` : null, p.matchedVia ? `matched by ${p.matchedVia}` : null].filter(Boolean).join(" · "),
        href: `/admin/payments?id=${p.id}`,
        action: { kind: "checkPayment", id: p.id },
      }));
    }
    case "overdue": {
      const plans = await prisma.paymentPlan.findMany({
        where: { status: "ACTIVE", nextDueDate: { lt: now } },
        orderBy: { nextDueDate: "asc" },
        take: take * 3,
        select: { nextDueDate: true, installmentAmountCents: true, user: { select: { id: true, name: true, email: true } } },
      });
      const seen = new Set<string>();
      return plans
        .filter((p) => (seen.has(p.user.id) ? false : (seen.add(p.user.id), true)))
        .slice(0, take)
        .map((p) => ({
          key: p.user.id,
          title: who(p.user),
          detail: `${money(p.installmentAmountCents)} was due ${dateOnly(p.nextDueDate)}`,
          href: `/admin/users/${p.user.id}`,
          action: { kind: "remind", id: p.user.id },
        }));
    }
    case "support": {
      const rows = await prisma.assistantEscalation.findMany({
        where: { status: "OPEN" },
        orderBy: { createdAt: "asc" },
        take,
        select: {
          id: true,
          contactName: true,
          contactEmail: true,
          subject: true,
          user: { select: { name: true } },
          messages: { where: { sender: { not: "INTERNAL" } }, orderBy: { createdAt: "desc" }, take: 1, select: { body: true } },
        },
      });
      return rows.map((e) => ({
        key: e.id,
        title: e.user?.name ?? e.contactName ?? e.contactEmail,
        detail: (e.subject ?? e.messages[0]?.body ?? "").replace(/\s+/g, " ").slice(0, 90),
        href: `/admin/support/${e.id}`,
        action: null,
      }));
    }
    case "applicants": {
      const rows = await prisma.classRegistration.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        take,
        select: { id: true, fullName: true, instrument: true, createdAt: true },
      });
      return rows.map((r) => ({
        key: r.id,
        title: r.fullName,
        detail: `${r.instrument.charAt(0)}${r.instrument.slice(1).toLowerCase()} · applied ${dateOnly(r.createdAt)}`,
        href: "/admin/students",
        action: null,
      }));
    }
    case "requests": {
      const rows = await prisma.bookingRequest.findMany({
        where: { status: "PENDING", scheduledAt: { gt: now } },
        orderBy: { createdAt: "asc" },
        take,
        select: { id: true, scheduledAt: true, student: { select: { name: true, email: true } } },
      });
      return rows.map((r) => ({
        key: r.id,
        title: who(r.student),
        detail: `Asked for ${when(r.scheduledAt)}`,
        href: "/admin/schedule?view=REQUESTS",
        action: { kind: "confirmRequest", id: r.id },
      }));
    }
    case "unmarked": {
      const rows = await prisma.classBooking.findMany({
        where: { status: "SCHEDULED", scheduledAt: { lt: new Date(now.getTime() - 3 * 3_600_000) } },
        orderBy: { scheduledAt: "asc" },
        take,
        select: { id: true, scheduledAt: true, student: { select: { name: true, email: true } } },
      });
      return rows.map((b) => ({
        key: b.id,
        title: who(b.student),
        detail: when(b.scheduledAt),
        href: `/admin/today?day=${etDayKey(b.scheduledAt)}`,
        action: { kind: "mark", id: b.id },
      }));
    }
    case "scales": {
      const progress = await getAdminProgressOverview("");
      return progress
        .filter((p) => p.hasCurriculumAccess && p.accessKind !== "ADMIN" && p.nextApproval.state === "READY")
        .slice(0, take)
        .map((p) => {
          const next = p.nextApproval.state === "READY" ? p.scales.find((s) => s.slug === (p.nextApproval as { nextSlug: string }).nextSlug) : undefined;
          return {
            key: p.id,
            title: p.name ?? p.email,
            detail: next ? `Ready for ${next.code}: ${next.title}` : "Ready for the next scale",
            href: `/admin/users/${p.id}`,
            action: { kind: "approveScale", id: p.id },
          };
        });
    }
    default:
      return [];
  }
}

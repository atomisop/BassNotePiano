import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/ui/EmptyState";
import { CalendarDays, CreditCard } from "@/components/ui/appIcons";
import { HeroBand } from "@/components/ui/HeroBand";
import { ActionTiles } from "@/components/ui/ActionTiles";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import type { PaymentPlanCadence, PaymentPlanTerm } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import { getUserPaymentHistory } from "@/lib/payments";
import { CREDITS_PER_CLASS, describePaymentPlan } from "@/lib/classCreditPricing";
import { PaymentWaitNotice } from "@/components/billing/PaymentWaitNotice";
import { PageBack } from "@/components/ui/BackLink";
import { ChevronRight } from "@/components/ui/appIcons";
import { prisma } from "@/lib/prisma";
import { payAgainPath } from "@/lib/inPlaceLinks";
import { Callout, Meta } from "@/components/ui/CardKit";
import { StatusDot } from "@/components/ui/StatusDot";
import { HistoryPayButton } from "./HistoryPayButton";

const STATUS_LABEL: Record<string, string> = {
  AWAITING_TRANSFER: "Not sent yet",
  PENDING_REVIEW: "Checking",
  VERIFIED: "Paid",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
};

// A paid payment is the healthy state, so it gets no dot; the rest say what is going on (DESIGN.md, Hierarchy 5).
const STATUS_TONE: Record<string, "warning" | "danger" | "neutral" | null> = {
  AWAITING_TRANSFER: "neutral",
  PENDING_REVIEW: "warning",
  VERIFIED: null,
  REJECTED: "danger",
  EXPIRED: "neutral",
};

const METHOD_LABEL: Record<string, string> = { ZELLE: "Zelle", VENMO: "Venmo" };

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function describePayment(payment: {
  purpose: string;
  lessonQuantity: number | null;
  lessonType: string | null;
  installmentNumber: number | null;
  scaleGroup: { code: string; title: string } | null;
  paymentPlan: { cadence: PaymentPlanCadence; term: PaymentPlanTerm; termMonths: number } | null;
}): { eyebrow: string; title: string } {
  if (payment.purpose === "CURRICULUM") {
    return { eyebrow: "Curriculum", title: "Full platform unlock" };
  }
  if (payment.purpose === "FAMILY_PLAN_INSTALLMENT") {
    return { eyebrow: "Group plan", title: "Combined 28-day bill" };
  }
  if (payment.purpose === "FAMILY_PLAN_START") {
    return { eyebrow: "Family plan", title: "Combined first payment" };
  }
  if (payment.purpose === "PAYMENT_PLAN_INSTALLMENT" && payment.paymentPlan) {
    return {
      eyebrow: describePaymentPlan(payment.paymentPlan.cadence, payment.paymentPlan.term),
      title: `Installment ${payment.installmentNumber ?? "?"} of ${payment.paymentPlan.termMonths}`,
    };
  }
  if (payment.purpose === "CLASS_CREDITS" && payment.lessonQuantity) {
    if (payment.lessonType) {
      const typeLabel = payment.lessonType === "ONLINE" ? "Online" : "In-Person";
      return {
        eyebrow: "Lesson credits (legacy)",
        title: `${payment.lessonQuantity} × ${typeLabel} lesson${payment.lessonQuantity === 1 ? "" : "s"}`,
      };
    }
    // Extra classes: the row stores internal credits, a class is CREDITS_PER_CLASS of them.
    const classes = Math.max(1, Math.round(payment.lessonQuantity / CREDITS_PER_CLASS));
    return {
      eyebrow: "Extra classes",
      title: `${classes} extra class${classes === 1 ? "" : "es"}`,
    };
  }
  // Legacy Pay-As-You-Go row from before per-scale purchase was retired.
  return { eyebrow: payment.scaleGroup?.code ?? "Scale unlock", title: payment.scaleGroup?.title ?? "Scale unlock" };
}

export const metadata = { title: "Billing history" };

export default async function BillingHistoryPage(props: { searchParams: Promise<{ pay?: string }> }) {
  const { pay } = await props.searchParams;
  const session = await getServerAuthSession();
  if (!session?.user) redirect(`/login?callbackUrl=${encodeURIComponent(pay ? payAgainPath(pay) : "/billing/history")}`);

  const payments = await getUserPaymentHistory(session.user.id);
  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";
  // Unpaid and rejected bills can be paid right here, except a group member's own bill: the group's payer pays that one
  // (the server refuses it from anyone else too).
  const openIds = payments.filter((p) => p.status === "AWAITING_TRANSFER" || p.status === "REJECTED").map((p) => p.id);
  const paidBySomeoneElse = new Set(
    openIds.length === 0
      ? []
      : (
          await prisma.zellePayment.findMany({
            where: { id: { in: openIds }, paymentPlan: { familyGroup: { payerId: { not: session.user.id } } } },
            select: { id: true },
          })
        ).map((p) => p.id),
  );

  type Payment = (typeof payments)[number];
  const dateOf = (payment: Payment) => new Date(payment.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  // The screen's one fact, in this order: a bill this person can pay right now (Pay is then one tap, at the top), a payment
  // we are still checking, or else the last thing they paid, with its receipt.
  const toPay = payments.find((p) => (p.status === "AWAITING_TRANSFER" || p.status === "REJECTED") && !paidBySomeoneElse.has(p.id)) ?? null;
  const checking = toPay ? null : (payments.find((p) => p.status === "PENDING_REVIEW") ?? null);
  const lastPaid = toPay || checking ? null : (payments.find((p) => p.status === "VERIFIED") ?? null);
  const hero = toPay ?? checking ?? lastPaid;
  const heroText = hero ? describePayment(hero) : null;

  // A few rows shown, the rest folded (opened when a link asks for a payment that sits in the folded part).
  const SHOWN = 5;
  const first = payments.slice(0, SHOWN);
  const rest = payments.slice(SHOWN);
  const restHoldsTarget = Boolean(pay && rest.some((p) => p.id === pay));

  const row = (payment: Payment, i: number) => {
    const { eyebrow, title } = describePayment(payment);
    const tone = STATUS_TONE[payment.status];
    const paid = payment.status === "VERIFIED";
    const date = dateOf(payment);
    const body = (
      <>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={`text-body font-semibold tabular-nums ${payment.status === "EXPIRED" ? "text-slate-400" : "text-slate-50"}`}>{formatUsd(payment.amountCents)}</p>
            <p className="mt-0.5 truncate text-small text-slate-300">{title}</p>
            <Meta className="mt-0.5" items={[date, eyebrow, METHOD_LABEL[payment.method] ?? null, payment.referenceCode && <span className="font-mono">{payment.referenceCode}</span>]} />
          </div>
          <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
            {tone ? <StatusDot tone={tone}>{STATUS_LABEL[payment.status]}</StatusDot> : <span className="text-small text-slate-500">{STATUS_LABEL[payment.status]}</span>}
            {paid && <ChevronRight aria-hidden className="h-4 w-4 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-slate-300" />}
          </div>
        </div>
        {payment.status === "REJECTED" && payment.rejectionReason && <p className="mt-1.5 text-small text-red-400">Reason: {payment.rejectionReason}</p>}
      </>
    );
    return (
      <li key={payment.id} style={{ "--i": i } as CSSProperties} className="stagger-item py-3.5">
        {/* A paid payment's whole row opens its receipt. */}
        {paid ? (
          <Link
            href={`/billing/receipt/${payment.id}`}
            aria-label={`Receipt, ${formatUsd(payment.amountCents)}, ${title}, ${date}`}
            className="group -mx-2 block rounded-control px-2 py-0.5 transition hover:bg-slate-50/4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {body}
          </Link>
        ) : (
          body
        )}
        {payment.status === "PENDING_REVIEW" && (
          <PaymentWaitNotice paymentId={payment.id} submittedAt={payment.submittedAt ? new Date(payment.submittedAt).toISOString() : null} compact />
        )}
        {/* An unpaid or rejected bill is paid right here: Pay (or Resubmit) is the row's one button. The bill on the band at the
            top already has its button there, so its row stays a plain record. */}
        {(payment.status === "AWAITING_TRANSFER" || payment.status === "REJECTED") &&
          payment.id !== toPay?.id &&
          (paidBySomeoneElse.has(payment.id) ? (
            <p className="mt-1.5 text-small text-slate-500">The person who pays for your plan sends this one.</p>
          ) : (
            <div className="flex justify-end">
              <HistoryPayButton
                paymentId={payment.id}
                rejected={payment.status === "REJECTED"}
                amountCents={payment.amountCents}
                title={title}
                eyebrow={eyebrow}
                zelleHandle={zelleHandle}
                autoOpen={pay === payment.id}
              />
            </div>
          ))}
      </li>
    );
  };

  return (
    <div className="mx-auto w-full max-w-wide">
      <div data-deck-header className="deck-header -mt-4 pt-4">
        <PageBack href="/account" />
        <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Billing</p>
        <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Payment history</h1>
      </div>

      {payments.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<CreditCard />}
          title="No payments yet"
          description="Every payment you make for a plan or an extra class is listed here with its receipt."
          actionLabel="See the plans"
          actionHref="/billing/plans"
        />
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {hero && heroText && (
            <HeroBand
              eyebrow={toPay ? (toPay.status === "REJECTED" ? "Payment problem" : "To pay") : checking ? "Checking your payment" : "Last payment"}
              title={heroText.title}
              figure={formatUsd(hero.amountCents)}
              meta={<Meta items={[heroText.eyebrow, dateOf(hero), !toPay && (METHOD_LABEL[hero.method] ?? null)]} />}
            >
              {toPay ? (
                <div key="pay" className="space-y-3 pb-1 pt-3">
                  {toPay.status === "REJECTED" && toPay.rejectionReason && <Callout tone="danger">Reason: {toPay.rejectionReason}</Callout>}
                  <HistoryPayButton
                    hero
                    paymentId={toPay.id}
                    rejected={toPay.status === "REJECTED"}
                    amountCents={toPay.amountCents}
                    title={heroText.title}
                    eyebrow={heroText.eyebrow}
                    zelleHandle={zelleHandle}
                    autoOpen={pay === toPay.id}
                  />
                </div>
              ) : lastPaid ? (
                <div key="receipt" className="flex justify-end pb-1 pt-3">
                  <Link href={`/billing/receipt/${lastPaid.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                    View receipt
                  </Link>
                </div>
              ) : null}
            </HeroBand>
          )}

          <ActionTiles
            title="What do you want to do?"
            items={[
              { href: "/billing/plans", label: "My plan", detail: "Next bill and length", icon: <CreditCard /> },
              { href: "/lessons", label: "My classes", detail: "See what is booked", icon: <CalendarDays /> },
            ]}
          />

          {/* One list of rows, not a pile of boxes: the amount and its state first, what it was for and when quiet under it. */}
          <section aria-label="All payments">
            <h2 className="px-1 text-caption font-medium uppercase tracking-caps text-slate-500">All payments</h2>
            <ul className="mt-3 divide-y divide-slate-50/8 rounded-card bg-neu-base px-4 shadow-raised-low sm:px-5">
              {first.map(row)}
              {rest.length > 0 && (
                <li>
                  <details className="group/more" open={restHoldsTarget}>
                    <summary className="tap flex cursor-pointer list-none items-center py-3.5 text-small font-medium text-slate-400 hover:text-slate-200 group-open/more:hidden [&::-webkit-details-marker]:hidden">
                      Show {rest.length} more
                    </summary>
                    <ul className="divide-y divide-slate-50/8">{rest.map((payment, i) => row(payment, i + SHOWN))}</ul>
                  </details>
                </li>
              )}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

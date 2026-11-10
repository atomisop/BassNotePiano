import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Flame, Plus } from "@/components/ui/appIcons";
import { Meta } from "@/components/ui/CardKit";
import { StatusDot } from "@/components/ui/StatusDot";
import { getServerAuthSession } from "@/lib/auth";
import { WideLayout } from "@/components/layout/PageLayouts";
import { ParentLinksPanel } from "@/components/parent/ParentLinksPanel";
import { ZelleUnlockGate } from "@/components/billing/ZelleUnlockGate";
import { buttonVariants } from "@/components/ui/button";
import { Hint } from "@/components/ui/Hint";
import { listChildSummaries, listParentBills } from "@/lib/parentChildren";
import { submitPlanInstallmentPaymentAction } from "../billing/plans/actions";
import { formatDateTime } from "@/lib/classScheduleLabels";
import { PageBack } from "@/components/ui/BackLink";

export const metadata = { title: "Parent mode" };

export default async function ParentPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/parent");
  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";
  const [children, bills] = await Promise.all([listChildSummaries(session.user.id), listParentBills(session.user.id, zelleHandle)]);

  return (
    <WideLayout>
      <div data-deck-header className="deck-header -mt-4 pt-4">
        <PageBack href="/account" />
        <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Account</p>
        <h1 className="mt-1.5 font-hero text-hero font-bold text-balance text-slate-50">Parent mode</h1>
      </div>

      {bills.length > 0 && (
        <section className="mt-6 space-y-3" aria-label="Payments to make">
          <h2 className="px-1 text-small font-semibold uppercase tracking-caps text-slate-400">To pay</h2>
          {bills.map((bill) => (
            // Whose bill it is and what for, then the one primary button, which carries the amount.
            <div key={bill.paymentId} className="rounded-card bg-neu-base p-4 shadow-raised-mid md:p-5">
              <div className="mb-3 min-w-0">
                <p className="truncate text-body font-semibold text-slate-50">{bill.childName}</p>
                <Meta items={[bill.label, bill.planName]} />
              </div>
              <ZelleUnlockGate
                status={bill.status}
                rejectionReason={bill.rejectionReason}
                scaleCode={`${bill.childName}: ${bill.label}`}
                scaleTitle={bill.planName}
                eyebrowLabel="Plan for your child"
                amountCents={bill.amountCents}
                zelleHandle={zelleHandle}
                paymentId={bill.paymentId}
                onSubmitPayment={submitPlanInstallmentPaymentAction.bind(null, bill.paymentId)}
              />
            </div>
          ))}
        </section>
      )}

      {/* Two columns from lg (children beside the link form), so a computer screen is not one narrow strip (2026-11-02 audit). */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-8">
      <section className="mt-6" aria-label="Your children">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-1 text-title font-semibold text-slate-50">
            Your children
            <Hint>Open a child to see their progress and practice, change their class times and weekly time, and check their plan.</Hint>
          </h2>
          <Link href="/billing/plans?who=parent" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            <Plus aria-hidden className="mr-1.5 h-4 w-4" />
            Start a plan
          </Link>
        </div>
        {children.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-neu-base p-5 text-small text-slate-500 shadow-raised-low"><Hint>No linked children yet. Add one with the form.</Hint></p>
        ) : (
          // One row per child: the name and the one fact that matters (their next class), the rest a quiet line, the whole row opens them.
          <ul className="mt-3 divide-y divide-slate-50/8 overflow-hidden rounded-card bg-neu-base shadow-raised-low">
            {children.map((c) => {
              const owes = bills.some((b) => b.childIds.includes(c.childId) && b.status !== "PENDING_REVIEW");
              return (
                <li key={c.childId}>
                  <Link href={`/parent/${c.childId}`} className="group flex items-center justify-between gap-3 px-4 py-3.5 transition hover:bg-slate-50/4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:px-5">
                    <div className="min-w-0">
                      <p className="truncate text-body font-semibold text-slate-50">{c.name}</p>
                      <p className={`mt-0.5 truncate text-small ${c.nextClass ? "text-slate-300" : "text-slate-500"}`}>
                        {c.nextClass ? `Next class ${formatDateTime(c.nextClass)}` : "No class booked"}
                      </p>
                      <Meta
                        className="mt-0.5 truncate"
                        items={[
                          c.planName ?? "No plan yet",
                          `${c.doneLast7}/7 days practiced`,
                          c.streak > 0 && (
                            <span className="inline-flex items-center gap-0.5">
                              <Flame aria-hidden className="h-3 w-3 text-signal-fg" />
                              {c.streak}
                            </span>
                          ),
                          `${c.scalesDone} ${c.scalesDone === 1 ? "scale" : "scales"} done`,
                        ]}
                      />
                    </div>
                    <span className="flex shrink-0 items-center gap-2">
                      {owes && <StatusDot tone="warning">Bill to pay</StatusDot>}
                      <ChevronRight aria-hidden className="h-4 w-4 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-slate-300" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-8 rounded-2xl bg-neu-base p-5 shadow-raised-low lg:mt-6" aria-label="Add or manage children">
        <h2 className="mb-4 text-title font-semibold text-slate-50">Link an account</h2>
        <ParentLinksPanel />
      </section>
      </div>
    </WideLayout>
  );
}

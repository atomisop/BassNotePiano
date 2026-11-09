import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Flame, Plus } from "@/components/ui/appIcons";
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
        <section className="mt-6 space-y-4" aria-label="Payments to make">
          <h2 className="text-title font-semibold text-slate-50">To pay</h2>
          {bills.map((bill) => (
            <ZelleUnlockGate
              key={bill.paymentId}
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
          <Link href="/billing/plans?who=parent" className={buttonVariants({ variant: "primary", size: "sm" })}>
            <Plus aria-hidden className="mr-1.5 h-4 w-4" />
            Start a plan
          </Link>
        </div>
        {children.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-neu-base p-5 text-small text-slate-500 shadow-raised-low"><Hint>No linked children yet. Add one with the form.</Hint></p>
        ) : (
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {children.map((c) => (
              <li key={c.childId}>
                <Link href={`/parent/${c.childId}`} className="press-soft block rounded-2xl bg-neu-base p-5 shadow-raised-low transition hover:shadow-raised-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-body font-semibold text-slate-50">{c.name}</p>
                      <p className="mt-0.5 truncate text-small text-slate-500">{c.planName ?? "No plan yet"}</p>
                    </div>
                    <ArrowRight aria-hidden className="mt-1 h-4 w-4 shrink-0 text-slate-500" />
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-2 text-small">
                    <div>
                      <dt className="text-slate-500">Practice</dt>
                      <dd className="mt-0.5 font-medium tabular-nums text-slate-100">{c.doneLast7}/7 days</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Streak</dt>
                      <dd className="mt-0.5 flex items-center gap-1 font-medium tabular-nums text-slate-100">
                        <Flame aria-hidden className="h-3.5 w-3.5 text-signal-fg" />
                        {c.streak}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Scales</dt>
                      <dd className="mt-0.5 font-medium tabular-nums text-slate-100">{c.scalesDone} done</dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-small text-slate-400">{c.nextClass ? `Next class ${formatDateTime(c.nextClass)}` : "No class booked"}</p>
                </Link>
              </li>
            ))}
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

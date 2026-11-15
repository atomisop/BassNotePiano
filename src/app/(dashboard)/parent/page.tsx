import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, CreditCard, FileText, Flame } from "@/components/ui/appIcons";
import { HeroBand } from "@/components/ui/HeroBand";
import { ActionTiles } from "@/components/ui/ActionTiles";
import { Meta } from "@/components/ui/CardKit";
import { StatusDot } from "@/components/ui/StatusDot";
import { getServerAuthSession } from "@/lib/auth";
import { WideLayout } from "@/components/layout/PageLayouts";
import { ParentLinksPanel } from "@/components/parent/ParentLinksPanel";
import { ZelleUnlockGate } from "@/components/billing/ZelleUnlockGate";
import { buttonVariants } from "@/components/ui/button";
import { listChildSummaries, listParentBills } from "@/lib/parentChildren";
import { submitPlanInstallmentPaymentAction } from "../billing/plans/actions";
// Eastern: this page is drawn on the server, whose own clock is not the studio's.
import { formatEtShort as formatDateTime } from "@/lib/classScheduleLabels";
import { PageBack } from "@/components/ui/BackLink";

export const metadata = { title: "Parent mode" };

// Class times are the studio's (Eastern), the same as the weekly time written beside them, and the same on the server and in the browser.
const classDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long", month: "short", day: "numeric" });
const classTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export default async function ParentPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/parent");
  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";
  const [children, bills] = await Promise.all([listChildSummaries(session.user.id), listParentBills(session.user.id, zelleHandle)]);
  // The screen's one fact: a bill to pay comes first; with none, the soonest class any child has.
  const firstBill = bills[0] ?? null;
  const otherBills = bills.slice(1);
  const nextUp = children.filter((c) => c.nextClass).sort((a, b) => new Date(a.nextClass!).getTime() - new Date(b.nextClass!).getTime())[0] ?? null;

  return (
    <WideLayout>
      <div data-deck-header className="deck-header -mt-4 pt-4">
        <PageBack href="/account" />
        <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Account</p>
        <h1 className="mt-1.5 font-hero text-hero font-bold text-balance text-slate-50">Parent mode</h1>
      </div>

      <div className="mt-6 flex flex-col gap-6">
        {/* The band: the bill to pay when there is one (Pay on the sheet), otherwise the next class any child has. */}
        {firstBill ? (
          <HeroBand
            eyebrow={firstBill.status === "PENDING_REVIEW" ? "Checking your payment" : firstBill.status === "REJECTED" ? "Payment problem" : "To pay"}
            title={`${firstBill.childName} \u00b7 ${firstBill.label}`}
            figure={usd(firstBill.amountCents)}
            meta={<Meta items={[firstBill.planName, otherBills.length > 0 && `${otherBills.length} more to pay below`]} />}
          >
            <div key="pay" className="pb-1 pt-3">
              <ZelleUnlockGate
                startOpen={false}
                status={firstBill.status}
                rejectionReason={firstBill.rejectionReason}
                scaleCode={`${firstBill.childName}: ${firstBill.label}`}
                scaleTitle={firstBill.planName}
                eyebrowLabel="Plan for your child"
                amountCents={firstBill.amountCents}
                zelleHandle={zelleHandle}
                paymentId={firstBill.paymentId}
                onSubmitPayment={submitPlanInstallmentPaymentAction.bind(null, firstBill.paymentId)}
                compact
              />
            </div>
          </HeroBand>
        ) : nextUp?.nextClass ? (
          <HeroBand
            eyebrow="Next class"
            title={`${nextUp.name.split(" ")[0]}, ${classDay(nextUp.nextClass)}`}
            figure={classTime(nextUp.nextClass)}
            meta={<Meta items={[nextUp.planName ?? "No plan yet", `${nextUp.doneLast7}/7 days practiced`]} />}
          >
            <div key="open" className="flex justify-end pb-1 pt-3">
              <Link href={`/parent/${nextUp.childId}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                Open {nextUp.name.split(" ")[0]}
              </Link>
            </div>
          </HeroBand>
        ) : children.length > 0 ? (
          <HeroBand eyebrow="Next class" title="No class booked" />
        ) : null}

        {otherBills.length > 0 && (
          <section className="space-y-3" aria-label="More payments to make">
            <h2 className="px-1 text-caption font-medium uppercase tracking-caps text-slate-500">Also to pay</h2>
            {otherBills.map((bill) => (
              // Whose bill it is and what for, then the one primary button, which carries the amount.
              <div key={bill.paymentId} className="rounded-card bg-neu-base p-4 shadow-raised-low md:p-5">
                <div className="mb-3 min-w-0">
                  <p className="truncate text-body font-semibold text-slate-50">{bill.childName}</p>
                  <Meta items={[bill.label, bill.planName]} />
                </div>
                <ZelleUnlockGate
                startOpen={false}
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

        <ActionTiles
          title="What do you want to do?"
          items={[
            { href: "/billing/plans?who=parent", label: "Start a plan", detail: "For a child", icon: <CreditCard /> },
            { href: "/billing/history", label: "Payment history", detail: "Bills and receipts", icon: <FileText /> },
          ]}
        />
      </div>

      {/* Two columns from lg (children beside the link form), so a computer screen is not one narrow strip (2026-11-02 audit). */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-8">
      <section className="mt-6" aria-label="Your children">
        <h2 className="flex items-center gap-1 px-1 text-caption font-medium text-slate-500">
          <span className="uppercase tracking-caps">Your children</span>
        </h2>
        {children.length === 0 ? (
          <p className="mt-3 rounded-card bg-neu-base p-5 text-small text-slate-500 shadow-raised-low">No linked children yet. Add one with the form.</p>
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

      <section className="mt-8 rounded-card bg-neu-base p-5 shadow-raised-low lg:mt-6" aria-label="Add or manage children">
        <h2 className="mb-4 text-title font-semibold text-slate-50">Link an account</h2>
        <ParentLinksPanel />
      </section>
      </div>
    </WideLayout>
  );
}

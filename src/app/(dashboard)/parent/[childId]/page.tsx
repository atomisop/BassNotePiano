import { notFound, redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { WideLayout } from "@/components/layout/PageLayouts";
import { BackLink, PageBack } from "@/components/ui/BackLink";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { prisma } from "@/lib/prisma";
import { ChildView } from "@/components/parent/ChildView";
import Link from "next/link";
import { Plus } from "@/components/ui/appIcons";
import { ZelleUnlockGate } from "@/components/billing/ZelleUnlockGate";
import { buttonVariants } from "@/components/ui/button";
import { getChildView, listParentBills } from "@/lib/parentChildren";
import { submitPlanInstallmentPaymentAction } from "../../billing/plans/actions";
import { isParentOf } from "@/lib/parentLinks";

export const metadata = { title: "Parent mode" };

export default async function ParentChildPage({ params, searchParams }: { params: Promise<{ childId: string }>; searchParams: Promise<{ move?: string | string[] }> }) {
  const { childId } = await params;
  // ?move=<class>: the child asked to move or skip that class, so its move picker opens on arrival (ChildClasses checks it is theirs).
  const move = (await searchParams).move;
  const openMoveFor = typeof move === "string" && /^[a-z0-9]{10,40}$/i.test(move) ? move : null;
  const session = await getServerAuthSession();
  if (!session?.user) redirect(`/login?callbackUrl=${encodeURIComponent(`/parent/${childId}${openMoveFor ? `?move=${openMoveFor}` : ""}`)}`);
  // Anyone who is not this child's linked parent sees nothing, not even that the account exists.
  if (!(await isParentOf(session.user.id, childId))) notFound();
  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";
  const [view, allBills] = await Promise.all([getChildView(session.user.id, childId), listParentBills(session.user.id, zelleHandle)]);
  // Everything for this child in one place: what is due for them shows here, so the parent never has to go to Billing.
  const bills = allBills.filter((b) => b.childIds.includes(childId));
  // Just names, for the "Switch child" picker (the page it opens checks access itself).
  const kids = (await prisma.parentLink.findMany({ where: { parentId: session.user.id, status: "ACCEPTED" }, select: { child: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } })).map((l) => ({ id: l.child.id, name: l.child.name ?? "Child" }));

  return (
    <WideLayout>
      <div data-deck-header className="deck-header -mt-4 pt-4">
        <PageBack href="/parent" />
        <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Parent mode</p>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-hero text-hero font-bold text-balance text-slate-50">{view.name}</h1>
          <ChildSwitcher currentId={childId} kids={kids} />
        </div>
      </div>
      {bills.length > 0 && (
        <section className="mt-5 space-y-3" aria-label="To pay">
          {bills.map((bill) => (
            <div key={bill.paymentId} className="rounded-card bg-neu-base p-4 shadow-raised-mid md:p-5">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-body font-semibold text-slate-50">{bill.label}</p>
                <p className="shrink-0 text-small text-slate-500">{bill.planName}</p>
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
      {!view.plan && bills.length === 0 && (
        <Link href={`/billing/plans?who=parent&child=${encodeURIComponent(childId)}`} className={buttonVariants({ variant: "primary", size: "sm", className: "mt-5" })}>
          <Plus aria-hidden className="mr-1.5 h-4 w-4" />
          Start a plan for {view.name.split(" ")[0]}
        </Link>
      )}
      <ChildView view={view} openMoveFor={openMoveFor} />
    </WideLayout>
  );
}

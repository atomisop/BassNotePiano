import { ZelleUnlockGate } from "@/components/billing/ZelleUnlockGate";
import { groupPlanSentence, planBillName, planBillState, type PlanBillGroup, type PlanBillInstallment, type PlanBillPlan } from "@/components/billing/planBillState";
import { submitPlanInstallmentPaymentAction } from "@/app/(dashboard)/billing/plans/actions";

/**
 * What sits on the sheet under the plan band on Billing > Plans: the one thing to do about the bill. Pay (the screen's one primary
 * button, carrying the amount), or the wait notice while a payment is being checked, or one quiet line when nothing is owed. A
 * group plan says who pays, right where the bill is.
 */
export function PlanBillSheet({
  planLabel,
  plan,
  installment,
  group,
  zelleHandle,
  nextInstallmentDueDate,
}: {
  planLabel: string;
  plan: PlanBillPlan;
  installment: (PlanBillInstallment & { id: string; rejectionReason: string | null }) | null;
  group: PlanBillGroup | null;
  zelleHandle: string;
  /** ISO. Set when nothing is payable yet: the day the next bill opens. */
  nextInstallmentDueDate?: string;
}) {
  const memberView = group !== null && !group.isPayer;
  const waitingForFirstPayment = plan.installmentsPaid === 0;
  const state = planBillState(plan, installment, memberView);
  return (
    <div className="space-y-3 pb-1 pt-3">
      {state.note && !memberView && <p className="text-small text-slate-400">{state.note}</p>}
      {group && <p className="text-small text-slate-400">{groupPlanSentence(group)}</p>}
      {memberView && !group.waitingForStart ? null : installment ? (
        <ZelleUnlockGate
          status={installment.status}
          rejectionReason={installment.rejectionReason}
          scaleCode={planBillName(plan, installment, group)}
          scaleTitle={planLabel}
          eyebrowLabel={group ? "Group plan" : "Payment Plan"}
          amountCents={installment.amountCents}
          zelleHandle={zelleHandle}
          paymentId={installment.id}
          onSubmitPayment={submitPlanInstallmentPaymentAction.bind(null, installment.id)}
          compact
        />
      ) : (
        // Between bills, on purpose: one payment every 28 days is the product. This is the normal state for most of every cycle,
        // so it is one quiet line.
        <div className="flex items-center gap-2 text-small text-slate-400" role="status">
          <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${waitingForFirstPayment ? "bg-slate-500" : "bg-emerald-400"}`} />
          <p>
            <span className="font-medium text-slate-100">{waitingForFirstPayment ? "Nothing to pay right now." : "You’re all paid up."}</span>
            {waitingForFirstPayment
              ? " Your plan starts when the first payment arrives."
              : nextInstallmentDueDate
                ? ` Your next bill opens on ${new Date(nextInstallmentDueDate).toLocaleDateString("en-US", { month: "long", day: "numeric" })}.`
                : ""}
          </p>
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "@/components/ui/appIcons";
import { Collapse } from "@/components/ui/Collapse";
import { buttonVariants } from "@/components/ui/button";
import { PausePlanCard } from "@/components/account/PausePlanCard";
import { ManageSubscriptions, type ActivePlanInfo } from "@/components/account/ManageSubscriptions";
import { ZellePaymentModal } from "@/components/progression/ZellePaymentModal";
import { getPaymentStatusAction } from "@/app/(dashboard)/billing/lessons/actions";
import { precheckReceiptAction } from "@/app/(dashboard)/billing/receipt-actions";
import { announceChange } from "@/lib/liveEvents";
import type { ZelleReferenceSubmission } from "@/lib/payments";
import { cn } from "@/lib/utils";
import { cancelPaymentPlanBySelfAction, changePaymentPlanTermAction, pausePaymentPlanAction } from "../../account/actions";
import { submitPlanInstallmentPaymentAction } from "./actions";

type Row = "pause" | "length" | "cancel";

/** The bill a refused pause is waiting on: paying it is one tap from the refusal itself. */
export interface PauseBill {
  id: string;
  amountCents: number;
  title: string;
  eyebrow: string;
}

/**
 * Pause, change length and cancel, as quiet rows under the plan's band and tiles on Billing > Plans: the same controls Settings has, opened in place
 * (no trip to Settings). A pause that is refused because a payment is due says so on the row, with a Pay button that opens the
 * payment sheet right there.
 */
export function PlanControls({
  plan,
  canPause,
  pauseBlocked,
  pauseNeedsPay,
  bill,
  zelleHandle,
}: {
  plan: ActivePlanInfo;
  /** A group plan is paused by the teacher, so the row is left out. */
  canPause: boolean;
  /** Why a pause would be refused now, in plain words, or null. */
  pauseBlocked: string | null;
  /** The refusal is about money: show the Pay button. */
  pauseNeedsPay: boolean;
  bill: PauseBill | null;
  zelleHandle: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Row | null>(null);
  const [paying, setPaying] = useState(false);
  const checkStatus = useCallback(() => (bill ? getPaymentStatusAction(bill.id) : Promise.resolve(null)), [bill]);
  const paused = Boolean(plan.pausedUntil || plan.pausedIndefinitely);

  const toggle = (row: Row) => setOpen((now) => (now === row ? null : row));

  async function submit(payload: ZelleReferenceSubmission) {
    if (!bill) return;
    await submitPlanInstallmentPaymentAction(bill.id, payload);
    announceChange("payments");
    router.refresh();
  }

  const rowClass = "tap flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-small font-medium text-slate-100 transition hover:text-slate-50";

  return (
    <section aria-label="Change your plan">
      <h2 className="px-1 text-caption font-medium uppercase tracking-caps text-slate-500">Change your plan</h2>
      {/* Quiet rows under the tiles: each opens in place. Cancel is the rare, final one, so it is last and the quietest. */}
      <div className="mt-3 divide-y divide-slate-50/8 rounded-card bg-neu-base shadow-raised-low">
      {canPause && (
        <div>
          {pauseBlocked && !paused ? (
            // Refused up front: the reason, and the one thing that fixes it.
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
              <div className="min-w-0">
                <p className="text-small font-medium text-slate-100">Pause your plan</p>
                <p className="mt-0.5 text-small text-amber-300">{pauseBlocked}</p>
              </div>
              {pauseNeedsPay && bill && (
                <button type="button" onClick={() => setPaying(true)} className={buttonVariants({ variant: "primary", size: "sm", className: "shrink-0" })}>
                  Pay
                </button>
              )}
            </div>
          ) : (
            <>
              <button type="button" aria-expanded={open === "pause"} onClick={() => toggle("pause")} className={rowClass}>
                <span>{paused ? "Your plan is paused" : "Pause your plan"}</span>
                <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 text-slate-500 transition-transform", open === "pause" && "rotate-180")} />
              </button>
              <Collapse open={open === "pause"}>
                <div className="px-4 pb-4">
                  <PausePlanCard
                    pausedAt={plan.pausedAt ?? null}
                    pausedUntil={plan.pausedUntil ?? null}
                    indefinite={plan.pausedIndefinitely ?? false}
                    covered={plan.installmentAmountCents === 0}
                    onPause={pausePaymentPlanAction}
                  />
                </div>
              </Collapse>
            </>
          )}
        </div>
      )}
      {!plan.family && (
        <div>
          <button type="button" aria-expanded={open === "length"} onClick={() => toggle("length")} className={rowClass}>
            <span>Change length</span>
            <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 text-slate-500 transition-transform", open === "length" && "rotate-180")} />
          </button>
          <Collapse open={open === "length"}>
            <div className="px-4 pb-4">
              <ManageSubscriptions key="length" activePlan={plan} onChangeTerm={changePaymentPlanTermAction} onCancel={cancelPaymentPlanBySelfAction} startOn="switch" />
            </div>
          </Collapse>
        </div>
      )}
      <div>
        <button type="button" aria-expanded={open === "cancel"} onClick={() => toggle("cancel")} className={cn(rowClass, "text-slate-400")}>
          <span>Cancel plan</span>
          <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 text-slate-500 transition-transform", open === "cancel" && "rotate-180")} />
        </button>
        <Collapse open={open === "cancel"}>
          <div className="px-4 pb-4">
            <ManageSubscriptions key="cancel" activePlan={plan} onChangeTerm={changePaymentPlanTermAction} onCancel={cancelPaymentPlanBySelfAction} startOn="cancel" />
          </div>
        </Collapse>
      </div>
      </div>

      {bill && (
        <ZellePaymentModal
          isOpen={paying}
          onClose={() => setPaying(false)}
          scaleCode={bill.eyebrow}
          scaleTitle={bill.title}
          eyebrowLabel="Payment"
          amountCents={bill.amountCents}
          zelleHandle={zelleHandle}
          paymentId={bill.id}
          onSubmit={submit}
          onPrecheck={(base64, mimeType) => precheckReceiptAction(bill.id, base64, mimeType)}
          checkStatus={checkStatus}
          onVerified={() => {
            announceChange("payments");
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

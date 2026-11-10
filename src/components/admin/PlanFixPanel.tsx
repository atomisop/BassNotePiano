"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { toast } from "@/components/ui/Toaster";
import { newIdempotencyKey } from "@/lib/idempotencyClient";
import type { PlanFix } from "@/lib/planFixes";
import type { PaymentSummary } from "@/lib/payments";
import { approvePaymentAction, markBillPaidAction, paymentSummaryAction, rejectPaymentAction } from "@/app/(dashboard)/admin/payments/actions";
import { cancelPaymentPlanAction, recordPlanPaymentAction } from "@/app/(dashboard)/admin/payment-plans/actions";

const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const STATUS: Record<string, string> = { PENDING_REVIEW: "sent in, waiting for review", AWAITING_TRANSFER: "not paid yet" };

/**
 * The fix for a plan tool's refusal, shown inside the same dialog (owner only): approve, reject or mark paid the payment it waits on,
 * cancel the running plan in the way, or record the first payment. After it works, `onDone` lets the dialog carry on (try again or reload).
 */
export function PlanFixPanel({ fix, notify, onDone }: { fix: PlanFix; notify: boolean; onDone: () => void }) {
  return (
    <div className="space-y-2 rounded-xl bg-neu-base p-3 shadow-pressed-low">
      {fix.kind === "payment" && <PaymentFix paymentId={fix.paymentId} notify={notify} onDone={onDone} />}
      {fix.kind === "record-payment" && <RecordFix planId={fix.planId} notify={notify} onDone={onDone} />}
      {fix.kind === "cancel-plan" && <CancelFix planId={fix.planId} notify={notify} onDone={onDone} />}
    </div>
  );
}

function useStep(onDone: () => void) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Recording a group member's first payment is refused in favour of the group's combined first payment: show that one next.
  const [next, setNext] = useState<PlanFix | null>(null);
  async function step(title: string, work: () => Promise<{ ok: boolean; error: string | null; fix?: PlanFix | null } | void>, success: string) {
    setBusy(true);
    setNext(null);
    try {
      const hold = await toast.held(title, work, { mail: true });
      if (hold.undone) return;
      const result = hold.value;
      if (result && !result.ok) {
        if (result.fix) setNext(result.fix);
        return void toast.warning(result.error ?? "That did not go through.");
      }
      toast.success(success);
      router.refresh();
      onDone();
    } catch (err) {
      toast.error("That did not go through", { description: err instanceof Error && err.message ? err.message : "Try again." });
    } finally {
      setBusy(false);
    }
  }
  return { busy, step, next };
}

function PaymentFix({ paymentId, notify, onDone }: { paymentId: string; notify: boolean; onDone: () => void }) {
  const [summary, setSummary] = useState<PaymentSummary | null | undefined>(undefined);
  const [sure, setSure] = useState<"approve" | "mark" | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [key, setKey] = useState(() => newIdempotencyKey());
  const { busy, step } = useStep(() => {
    setKey(newIdempotencyKey());
    onDone();
  });

  useEffect(() => {
    let live = true;
    paymentSummaryAction(paymentId)
      .then((s) => live && setSummary(s))
      .catch(() => live && setSummary(null));
    return () => {
      live = false;
    };
  }, [paymentId]);

  if (summary === undefined) {
    return (
      <p className="inline-flex items-center gap-2 text-small text-slate-400">
        <MorphingSquare size={12} />
        Loading the payment
      </p>
    );
  }
  if (!summary) return <p className="text-small text-slate-400">That payment is gone. Try again.</p>;
  const settled = summary.status !== "PENDING_REVIEW" && summary.status !== "AWAITING_TRANSFER";

  return (
    <>
      <p className="text-small text-slate-200">
        <span className="font-medium text-slate-50">{summary.who}</span> · {summary.what} · {usd(summary.amountCents)}
      </p>
      <p className="text-small text-slate-500">{settled ? `Now ${summary.status.replace(/_/g, " ").toLowerCase()}. Try again.` : STATUS[summary.status]}</p>
      {!settled && rejecting ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why couldn't this be verified?"
            rows={2}
            className="w-full resize-none rounded-control border border-(--field-edge) bg-neu-base px-3 py-2 text-body text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => setRejecting(false)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Back
            </button>
            <button
              type="button"
              disabled={busy || !reason.trim()}
              onClick={() => void step("Rejecting the payment", () => rejectPaymentAction(summary.id, reason.trim(), notify), "Payment rejected")}
              className={buttonVariants({ variant: "danger", size: "sm" })}
            >
              {busy && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
              Confirm reject
            </button>
          </div>
        </div>
      ) : !settled ? (
        <div className="flex flex-wrap gap-2">
          {summary.status === "PENDING_REVIEW" && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => (sure === "approve" ? void step("Approving the payment", () => approvePaymentAction(summary.id, notify), "Payment approved") : setSure("approve"))}
                className={buttonVariants({ variant: "primary", size: "sm" })}
              >
                {busy && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                {sure === "approve" ? `Yes, approve ${usd(summary.amountCents)}` : "Approve"}
              </button>
              <button type="button" disabled={busy} onClick={() => setRejecting(true)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                Reject
              </button>
            </>
          )}
          {summary.status === "AWAITING_TRANSFER" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => (sure === "mark" ? void step("Marking the bill paid", () => markBillPaidAction(summary.id, notify, key), "Marked paid") : setSure("mark"))}
              className={buttonVariants({ variant: "primary", size: "sm" })}
            >
              {busy && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
              {sure === "mark" ? `Yes, ${usd(summary.amountCents)} arrived` : "Mark paid"}
            </button>
          )}
        </div>
      ) : (
        <button type="button" onClick={onDone} className={buttonVariants({ variant: "secondary", size: "sm" })}>
          Try again
        </button>
      )}
    </>
  );
}

function RecordFix({ planId, notify, onDone }: { planId: string; notify: boolean; onDone: () => void }) {
  const [sure, setSure] = useState(false);
  const [key, setKey] = useState(() => newIdempotencyKey());
  const { busy, step, next } = useStep(() => {
    setKey(newIdempotencyKey());
    onDone();
  });
  // A group member's first payment is the group's combined first payment: that one is shown to approve or mark paid instead.
  if (next?.kind === "payment") return <PaymentFix paymentId={next.paymentId} notify={notify} onDone={onDone} />;
  return (
    <>
      <p className="text-small text-slate-300">Record the first payment as received: it counts in revenue, opens their access, adds their credits and books their weekly time.</p>
      <button
        type="button"
        disabled={busy}
        onClick={() => (sure ? void step("Recording the payment", () => recordPlanPaymentAction(planId, notify, key), "Payment recorded") : setSure(true))}
        className={buttonVariants({ variant: "primary", size: "sm" })}
      >
        {busy && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
        {sure ? "Yes, record it" : "Record payment"}
      </button>
    </>
  );
}

function CancelFix({ planId, notify, onDone }: { planId: string; notify: boolean; onDone: () => void }) {
  const [note, setNote] = useState("");
  const { busy, step } = useStep(onDone);
  return (
    <>
      <p className="text-small text-slate-300">Cancel the plan that is running now. Its unpaid bill closes and its weekly time is freed.</p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Why is it being canceled?"
        rows={2}
        className="w-full resize-none rounded-control border border-(--field-edge) bg-neu-base px-3 py-2 text-body text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <button
        type="button"
        disabled={busy || !note.trim()}
        onClick={() => void step("Canceling the running plan", () => cancelPaymentPlanAction(planId, note.trim(), notify), "Plan canceled")}
        className={buttonVariants({ variant: "danger", size: "sm" })}
      >
        {busy && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
        Cancel that plan
      </button>
    </>
  );
}

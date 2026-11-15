"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles } from "@/components/ui/appIcons";
import { buttonVariants } from "@/components/ui/button";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { PulsatingDots } from "@/components/ui/pulsating-loader";
import { toast } from "@/components/ui/Toaster";
import { NotifyPlaceToggle, useNotifyStudent } from "@/components/admin/NotifyToggle";
import { ClassMoveCancelButtons, ScaleReleaseDialog } from "@/components/admin/ClassRowActions";
import { formatEtShort } from "@/lib/classScheduleLabels";
import { cn } from "@/lib/utils";
import { supportAccountPanelAction, type SupportAccountPanel as PanelData } from "@/app/(dashboard)/admin/inplace-actions";
import { approvePaymentAction, rejectPaymentAction } from "@/app/(dashboard)/admin/payments/actions";

const PLACE = "support";
const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const PURPOSE: Record<string, string> = {
  PAYMENT_PLAN_INSTALLMENT: "Plan bill",
  FAMILY_PLAN_START: "Group first payment",
  FAMILY_PLAN_INSTALLMENT: "Group bill",
  CLASS_CREDITS: "Class credits",
  FAMILY_BUNDLE: "Family credits",
  CURRICULUM: "Curriculum",
  CURRICULUM_FAMILY_BUNDLE: "Family curriculum",
};
const STATUS: Record<string, string> = { PENDING_REVIEW: "Waiting for your approval", AWAITING_TRANSFER: "Not paid yet", REJECTED: "Rejected, not paid again yet" };

/**
 * Beside a support chat (below it on a phone): the account the chat belongs to, with what usually needs fixing when someone writes in,
 * done right here. Their facts (the same as the Accounts side panel), bills and payments waiting for review with Approve and Reject,
 * their next classes with Reschedule and Cancel, and their next scale. Read once when the chat opens and again after each change.
 */
export function SupportAccountPanel({ userId }: { userId: string }) {
  const router = useRouter();
  const [data, setData] = useState<PanelData | null>(null);
  const [failed, setFailed] = useState(false);
  const [notify] = useNotifyStudent(PLACE, true);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [scaleOpen, setScaleOpen] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const next = await supportAccountPanelAction(userId);
      if (next) setData(next);
      else setFailed(true);
    } catch {
      setFailed(true);
    }
  }, [userId]);

  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  const changed = () => {
    void load();
    router.refresh();
  };

  async function approve(id: string) {
    setBusy(id);
    try {
      const hold = await toast.held("Approving payment", () => approvePaymentAction(id, notify), { mail: notify });
      if (hold.undone) return;
      toast.success("Payment approved");
      changed();
    } catch (err) {
      toast.error("Couldn't approve that payment", { description: err instanceof Error && err.message ? err.message : "Try again." });
    } finally {
      setBusy(null);
    }
  }

  async function reject(id: string) {
    if (!reason.trim()) return;
    setBusy(id);
    try {
      await rejectPaymentAction(id, reason.trim(), notify);
      toast.success("Payment rejected");
      setRejecting(null);
      setReason("");
      changed();
    } catch (err) {
      toast.error("Couldn't reject that payment", { description: err instanceof Error && err.message ? err.message : "Try again." });
    } finally {
      setBusy(null);
    }
  }

  if (failed && !data) {
    return (
      <aside aria-label="Their account" className="glass-surface p-4 text-small text-slate-400">
        Could not load their account.{" "}
        <button type="button" onClick={() => void load()} className="tap inline-flex items-center underline underline-offset-4">
          Try again
        </button>
      </aside>
    );
  }
  if (!data) {
    return (
      <aside aria-label="Their account" className="glass-surface p-4">
        <PulsatingDots className="justify-start" />
      </aside>
    );
  }

  const { person } = data;
  const fact = (label: string) => person.facts.find((f) => f.label === label);
  const plan = fact("Plan")?.value;
  const credits = fact("Credits")?.value;
  const discord = fact("Discord")?.value;
  const gray = [
    plan && plan !== "None" ? plan : "No plan",
    credits ? `${credits} ${credits === "1" ? "credit" : "credits"}` : null,
    discord === "Linked" ? "On Discord" : "Not on Discord",
  ].filter(Boolean);
  const bill = fact("Next bill");
  const section = "border-t border-slate-50/10 pt-3";
  const label = "text-caption font-medium uppercase tracking-caps text-slate-50/60";
  const first = (person.name ?? person.email).split(" ")[0];

  return (
    <aside aria-label="Their account" className="glass-surface space-y-3 p-4">
      <div>
        <Link href={`/admin/users/${person.id}`} className="text-title font-semibold text-slate-50 underline-offset-4 hover:underline">
          {person.name ?? person.email}
        </Link>
        <p className="mt-0.5 text-small text-slate-500">{gray.join(" · ")}</p>
        {bill && bill.value !== "None" && <p className={cn("text-small", bill.warn ? "text-red-300" : "text-slate-500")}>Next bill {bill.value}{bill.warn ? ", late" : ""}</p>}
        {person.banned && <p className="text-small text-red-300">Banned</p>}
      </div>

      <NotifyPlaceToggle place={PLACE} defaultOn label={`Notify ${first}`} />

      <div className={section}>
        <p className={label}>Bills and payments</p>
        {data.payments.length === 0 ? (
          <p className="mt-1 text-small text-slate-500">Nothing open.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {data.payments.map((p) => (
              <li key={p.id} className="rounded-control bg-slate-50/4 p-3">
                <Link href={`/admin/payments?id=${p.id}`} className="block hover:underline">
                  <span className="text-small font-medium text-slate-50">
                    {money(p.amountCents)} · {PURPOSE[p.purpose] ?? "Payment"}
                  </span>
                  <span className={cn("block text-small", p.status === "PENDING_REVIEW" ? "text-amber-300" : "text-slate-500")}>
                    {STATUS[p.status]} · {p.code}
                  </span>
                </Link>
                {p.status === "PENDING_REVIEW" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {/* Approving gives value away, so it is the owner's; anyone may reject. */}
                    {data.isOwner && (
                      <button type="button" disabled={busy !== null} onClick={() => void approve(p.id)} className={buttonVariants({ size: "sm" })}>
                        {busy === p.id && rejecting !== p.id && <MorphingSquare size={12} className="shrink-0" />}
                        Approve
                      </button>
                    )}
                    {rejecting !== p.id && (
                      <button type="button" disabled={busy !== null} onClick={() => { setRejecting(p.id); setReason(""); }} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-red-300 hover:text-red-200")}>
                        Reject
                      </button>
                    )}
                  </div>
                )}
                {rejecting === p.id && (
                  <form
                    className="mt-2 space-y-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void reject(p.id);
                    }}
                  >
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={300}
                      placeholder="Why (the student sees this)"
                      aria-label="Reason for rejecting"
                      className="w-full rounded-control bg-neu-base px-3 py-2 text-body text-slate-100 shadow-pressed-low outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setRejecting(null)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                        Never mind
                      </button>
                      <button type="submit" disabled={!reason.trim() || busy !== null} className={buttonVariants({ variant: "danger", size: "sm" })}>
                        {busy === p.id && <MorphingSquare size={12} className="shrink-0" />}
                        Reject payment
                      </button>
                    </div>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={section}>
        <p className={label}>Next classes</p>
        {data.classes.length === 0 ? (
          <p className="mt-1 text-small text-slate-500">None booked.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {data.classes.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-small text-slate-200">
                  {formatEtShort(c.scheduledAt)}
                  {c.inPerson ? " · In person" : ""}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <ClassMoveCancelButtons
                    notifyPlace={PLACE}
                    notifyDefaultOn
                    onDone={() => void load()}
                    row={{ bookingId: c.id, studentId: person.id, name: person.name ?? person.email, scheduledAt: c.scheduledAt, active: true }}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {data.nextScale && (
        <div className={section}>
          <p className={label}>Next scale</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="min-w-0 text-small text-slate-200">
              {data.nextScale.code}: {data.nextScale.title}
              <span className="block text-slate-500">{data.nextScale.state === "READY" ? "Ready to approve" : data.nextScale.state === "WAITING_PACE" ? "Waiting a week" : "Previous scale not finished"}</span>
            </span>
            <button type="button" onClick={() => setScaleOpen(true)} className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "shrink-0")}>
              <Sparkles aria-hidden className="h-4 w-4" />
              {data.nextScale.state === "READY" ? "Approve" : "Release"}
            </button>
          </div>
          <ScaleReleaseDialog
            userId={person.id}
            name={person.name ?? person.email}
            scale={data.nextScale}
            open={scaleOpen}
            onClose={() => setScaleOpen(false)}
            notify={notify}
            onDone={() => {
              setScaleOpen(false);
              changed();
            }}
          />
        </div>
      )}

      <Link href={`/admin/users/${person.id}`} className="tap inline-flex items-center text-small text-slate-400 underline underline-offset-4 hover:text-slate-50">
        Open their full account
      </Link>
    </aside>
  );
}

"use client";

import { NotifyToggle, useNotifyStudent } from "@/components/admin/NotifyToggle";
import { AdminListSearch, matchesQuery } from "@/components/admin/AdminListSearch";
import { Avatar as UiAvatar } from "@/components/ui/Avatar";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdminClassRegistration } from "@/lib/classRegistration";
import { INSTRUMENT_LABEL, SKILL_LABEL } from "@/lib/classRegistrationLabels";
import { applicantNextSteps } from "@/lib/applicantSteps";
import { newIdempotencyKey } from "@/lib/idempotencyClient";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { EmptyState } from "@/components/ui/EmptyState";
import { CheckCheck } from "@/components/ui/appIcons";
import { buttonVariants } from "@/components/ui/button";
import { ViewMore } from "@/components/ui/ViewMore";
import { toast } from "@/components/ui/Toaster";

export interface StudentQueueProps {
  registrations: AdminClassRegistration[];
  /** Answers with the applicant's account when they have one, so the next step can be offered right away. */
  onApprove: (registrationId: string, notify?: boolean) => Promise<{ accountId: string | null } | void>;
  onReject: (registrationId: string, reason: string, notify?: boolean) => Promise<void>;
  onSendSignUpLink: (registrationId: string, idempotencyKey?: string) => Promise<{ ok: boolean; message: string }>;
  emptyMessage?: string;
  /** Opens the list already searched (a Contacts row links here with the person's email). */
  initialQuery?: string;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-slate-50/15 text-slate-50",
  APPROVED: "bg-slate-50/15 text-slate-100",
  REJECTED: "bg-red-400/15 text-red-300",
};

const shortDate = (d: Date | string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function Avatar({ image, name }: { image: string | null | undefined; name: string }) {
  return <UiAvatar image={image ?? null} label={name} size="lg" className="h-12 w-12" />;
}

export function StudentQueue({ registrations, onApprove, onReject, onSendSignUpLink, emptyMessage = "No registrations yet.", initialQuery = "" }: StudentQueueProps) {
  const [query, setQuery] = useState(initialQuery);
  const [notify, setNotify] = useNotifyStudent("applicants", true);
  const shown = registrations.filter((item) => matchesQuery(item, query));
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [linkBusyId, setLinkBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  // Same fix as PaymentQueue's own: Approve used to fire on a single click
  // while Reject already required a second confirming click plus a reason.
  // Mirrors Reject's own two-step shape now instead of a new, different one.
  const [approvingId, setApprovingId] = useState<string | null>(null);

  async function sendSignUpLink(id: string) {
    setLinkBusyId(id);
    try {
      const res = await onSendSignUpLink(id, newIdempotencyKey());
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      router.refresh();
    } catch {
      toast.error("That did not go through. Please try again.");
    } finally {
      setLinkBusyId(null);
    }
  }

  async function handleApprove(reg: AdminClassRegistration) {
    setBusyId(reg.id);
    try {
      const hold = await toast.held("Approving the application", () => onApprove(reg.id, notify), { mail: notify });
      if (hold.undone) return;
      router.refresh();
      setApprovingId(null);
      // The next step, right in the toast: their plan when they have an account, the sign-up link when they do not.
      const accountId = hold.value && "accountId" in hold.value ? hold.value.accountId : reg.account?.id ?? null;
      if (accountId) {
        toast.success(`${reg.fullName} is approved.`, {
          duration: 10_000,
          action: { label: "Set up plan", onClick: () => router.push(`/admin/users/${accountId}?do=setup`) },
        });
      } else {
        toast.success(`${reg.fullName} is approved. They have no account yet.`, {
          duration: 10_000,
          action: { label: "Send sign-up link", onClick: () => void sendSignUpLink(reg.id) },
        });
      }
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(id: string) {
    if (!reason.trim()) return;
    setBusyId(id);
    try {
      const hold = await toast.held("Rejecting the application", () => onReject(id, reason.trim(), notify), { mail: notify });
      if (hold.undone) return;
      router.refresh();
      setRejectingId(null);
      setReason("");
    } finally {
      setBusyId(null);
    }
  }

  if (registrations.length === 0) {
    return <EmptyState icon={<CheckCheck />} title={emptyMessage.replace(/\.$/, "")}  />;
  }

  return (
    <div className="space-y-3">
      <AdminListSearch value={query} onChange={setQuery} placeholder="Search name, email, instrument" shown={shown.length} total={registrations.length} />
      <NotifyToggle on={notify} onChange={setNotify} label="Notify the applicant" />
      {shown.length === 0 && <p className="text-small text-slate-400">Nothing matches that search.</p>}
      <ViewMore items={shown} initial={8}>
      {(reg) => {
        const steps = applicantNextSteps(reg);
        return (
        <div key={reg.id} className="glass-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <Avatar image={reg.account?.image ?? reg.user?.image} name={reg.fullName} />
              <div className="min-w-0">
                <h2 className="text-title text-slate-50 font-semibold">{reg.fullName}</h2>
                <p className="mt-0.5 text-small text-slate-500">
                  {INSTRUMENT_LABEL[reg.instrument]} · {SKILL_LABEL[reg.skillLevel]}
                  {reg.account?.username && <> · @{reg.account.username}</>}
                </p>
              </div>
            </div>
            <span
              className={`inline-block rounded-full px-2.5 py-1 text-small font-medium uppercase tracking-wide ${STATUS_STYLE[reg.status]}`}
            >
              {STATUS_LABEL[reg.status]}
            </span>
          </div>

          <p className="mt-3 break-words text-small tabular-nums text-slate-500">
            {[reg.email, reg.phone, shortDate(reg.createdAt)].join(" · ")}
          </p>

          {reg.notes && <p className="mt-2 text-small text-slate-400">&ldquo;{reg.notes}&rdquo;</p>}
          {reg.status === "REJECTED" && reg.rejectionReason && (
            <p className="mt-2 text-small text-red-400">{reg.rejectionReason}</p>
          )}
          {reg.status !== "PENDING" && reg.reviewedBy && (
            <p className="mt-2 text-caption text-slate-500">{reg.reviewedBy.name ?? "Admin"}</p>
          )}

          {/* Who they are in the app: their account, or that they have none yet (not worth saying on a turned-down application). */}
          {(reg.account || reg.status !== "REJECTED") && (
          <p className="mt-2 text-small text-slate-400">
            {reg.account ? (
              <>
                <Link href={`/admin/users/${reg.account.id}`} className="tap inline-flex items-center text-slate-200 underline decoration-slate-600 underline-offset-2 hover:text-slate-50">
                  Open account
                </Link>
                {reg.account.banned ? <span className="text-red-400"> · Banned</span> : reg.account.onPlan ? <span> · On a plan</span> : null}
              </>
            ) : (
              <>No account yet{reg.signUpLinkSentAt && <> · Sign-up link sent {shortDate(reg.signUpLinkSentAt)}</>}</>
            )}
          </p>
          )}

          {reg.status !== "PENDING" ? (
            steps.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {steps.map((step, i) =>
                  step.kind === "signUpLink" ? (
                    <button
                      key={step.kind}
                      type="button"
                      onClick={() => void sendSignUpLink(reg.id)}
                      disabled={linkBusyId === reg.id}
                      className={buttonVariants({ variant: i === 0 ? "primary" : "secondary", size: "sm" })}
                    >
                      {linkBusyId === reg.id && <MorphingSquare size={12} className="shrink-0" />}
                      {linkBusyId === reg.id ? "Sending…" : reg.signUpLinkSentAt ? "Send sign-up link again" : step.label}
                    </button>
                  ) : (
                    <Link key={step.kind} href={step.href} className={buttonVariants({ variant: i === 0 ? "primary" : "secondary", size: "sm" })}>
                      {step.label}
                    </Link>
                  ),
                )}
              </div>
            )
          ) : rejectingId === reg.id ? (
            <div className="mt-4 space-y-2">
              <textarea
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why isn't this a fit right now?"
                rows={2}
                className="w-full resize-none glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-red-400/60"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRejectingId(null);
                    setReason("");
                  }}
                  disabled={busyId === reg.id}
                  className="tap flex-1 rounded-full py-2 text-small font-medium text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleReject(reg.id)}
                  disabled={busyId === reg.id || !reason.trim()}
                  className="tap flex flex-1 items-center justify-center rounded-full bg-red-500/95 py-2 text-small font-semibold text-slate-950 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50 shadow-raised-low active:shadow-pressed-low hover:shadow-raised-mid"
                >
                  {busyId === reg.id && <MorphingSquare size={13} className="mr-1.5 shrink-0" />}
                  {busyId === reg.id ? "Rejecting…" : "Confirm reject"}
                </button>
              </div>
            </div>
          ) : approvingId === reg.id ? (
            <div className="mt-4 space-y-2">
              <p className="text-small text-slate-400">Approve {reg.fullName}&apos;s registration?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setApprovingId(null)}
                  disabled={busyId === reg.id}
                  className="tap flex-1 rounded-full py-2 text-small font-medium text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleApprove(reg)}
                  disabled={busyId === reg.id}
                  className={buttonVariants({ variant: "primary", className: "flex-1" })}
                >
                  {busyId === reg.id && <MorphingSquare size={13} className="mr-1.5 shrink-0" />}
                  {busyId === reg.id ? "Approving…" : "Confirm approve"}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setRejectingId(reg.id)}
                disabled={busyId === reg.id}
                className="tap flex-1 rounded-full py-2 text-small font-medium text-slate-300 transition disabled:opacity-50 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => setApprovingId(reg.id)}
                disabled={busyId === reg.id}
                className={buttonVariants({ variant: "primary", className: "flex-1" })}
              >
                Approve
              </button>
            </div>
          )}
        </div>
        );
      }}
      </ViewMore>
    </div>
  );
}

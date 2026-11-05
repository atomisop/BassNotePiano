"use client";

import { NotifyToggle, useNotifyStudent } from "@/components/admin/NotifyToggle";
import { AdminListSearch, matchesQuery } from "@/components/admin/AdminListSearch";
import { Avatar as UiAvatar } from "@/components/ui/Avatar";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminClassRegistration } from "@/lib/classRegistration";
import { INSTRUMENT_LABEL, SKILL_LABEL } from "@/lib/classRegistrationLabels";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { EmptyState } from "@/components/ui/EmptyState";
import { CheckCheck } from "@/components/ui/appIcons";
import { Button } from "@/components/ui/button";
import { ViewMore } from "@/components/ui/ViewMore";
import { toast } from "@/components/ui/Toaster";

export interface StudentQueueProps {
  registrations: AdminClassRegistration[];
  onApprove: (registrationId: string, notify?: boolean) => Promise<void>;
  onReject: (registrationId: string, reason: string, notify?: boolean) => Promise<void>;
  emptyMessage?: string;
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

function Avatar({ image, name }: { image: string | null | undefined; name: string }) {
  return <UiAvatar image={image ?? null} label={name} size="lg" className="h-12 w-12" />;
}

export function StudentQueue({ registrations, onApprove, onReject, emptyMessage = "No registrations yet." }: StudentQueueProps) {
  const [query, setQuery] = useState("");
  const [notify, setNotify] = useNotifyStudent("applicants", true);
  const shown = registrations.filter((item) => matchesQuery(item, query));
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  // Same fix as PaymentQueue's own: Approve used to fire on a single click
  // while Reject already required a second confirming click plus a reason.
  // Mirrors Reject's own two-step shape now instead of a new, different one.
  const [approvingId, setApprovingId] = useState<string | null>(null);

  async function handleApprove(id: string) {
    setBusyId(id);
    try {
      const hold = await toast.held("Approving the application", () => onApprove(id, notify), { mail: notify });
      if (hold.undone) return;
      router.refresh();
      setApprovingId(null);
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
    return <EmptyState icon={<CheckCheck />} title={emptyMessage.replace(/\.$/, "")} description="New applications show up here as soon as they come in." />;
  }

  return (
    <div className="space-y-3">
      <AdminListSearch value={query} onChange={setQuery} placeholder="Search name, email, instrument" shown={shown.length} total={registrations.length} />
      <NotifyToggle on={notify} onChange={setNotify} label="Email the applicant when I approve or turn them down" />
      {shown.length === 0 && <p className="text-small text-slate-400">Nothing matches that search.</p>}
      <ViewMore items={shown} initial={8}>
      {(reg) => (
        <div key={reg.id} className="glass-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <Avatar image={reg.user?.image} name={reg.fullName} />
              <div>
                <h2 className="text-title text-slate-50 font-semibold">{reg.fullName}</h2>
                <p className="mt-0.5 text-small text-slate-500">
                  {INSTRUMENT_LABEL[reg.instrument]} · {SKILL_LABEL[reg.skillLevel]}
                  {reg.user?.username && <> · @{reg.user.username}</>}
                </p>
              </div>
            </div>
            <span
              className={`inline-block rounded-full px-2.5 py-1 text-small font-medium uppercase tracking-wide ${STATUS_STYLE[reg.status]}`}
            >
              {STATUS_LABEL[reg.status]}
            </span>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-small sm:grid-cols-3">
            <div>
              <dt className="text-small text-slate-500">Email</dt>
              <dd className="text-slate-300">{reg.email}</dd>
            </div>
            <div>
              <dt className="text-small text-slate-500">Phone</dt>
              <dd className="text-slate-300">{reg.phone}</dd>
            </div>
            <div>
              <dt className="text-small text-slate-500">Submitted</dt>
              <dd className="text-slate-300">{new Date(reg.createdAt).toLocaleString()}</dd>
            </div>
          </dl>

          {reg.notes && <p className="mt-3 text-small text-slate-500">Note: {reg.notes}</p>}
          {reg.status === "REJECTED" && reg.rejectionReason && (
            <p className="mt-2 text-small text-red-400">Rejected: {reg.rejectionReason}</p>
          )}
          {reg.status !== "PENDING" && reg.reviewedBy && (
            <p className="mt-2 text-small text-slate-500">Reviewed by {reg.reviewedBy.name ?? "an admin"}</p>
          )}

          {reg.status !== "PENDING" ? null : rejectingId === reg.id ? (
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
                <Button
                  type="button"
                  onClick={() => handleApprove(reg.id)}
                  disabled={busyId === reg.id}
                  variant="primary" className="flex-1"
                >
                  {busyId === reg.id && <MorphingSquare size={13} className="mr-1.5 shrink-0" />}
                  {busyId === reg.id ? "Approving…" : "Confirm approve"}
                </Button>
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
              <Button
                type="button"
                onClick={() => setApprovingId(reg.id)}
                disabled={busyId === reg.id}
                variant="primary" className="flex-1"
              >
                Approve
              </Button>
            </div>
          )}
        </div>
      )}
      </ViewMore>
    </div>
  );
}

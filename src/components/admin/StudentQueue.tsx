"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminClassRegistration } from "@/lib/classRegistration";
import { INSTRUMENT_LABEL, SKILL_LABEL } from "@/lib/classRegistrationLabels";
import { MorphingSquare } from "@/components/ui/morphing-square";

export interface StudentQueueProps {
  registrations: AdminClassRegistration[];
  onApprove: (registrationId: string) => Promise<void>;
  onReject: (registrationId: string, reason: string) => Promise<void>;
  emptyMessage?: string;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-[rgb(var(--c-s-50)/0.15)] text-[rgb(var(--c-s-50))]",
  APPROVED: "bg-emerald-400/15 text-emerald-300",
  REJECTED: "bg-red-400/15 text-red-300",
};

function Avatar({ image, name }: { image: string | null | undefined; name: string }) {
  return (
    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-ink/10 bg-slate-800">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-serif text-lg text-[rgb(var(--c-s-50))]">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
}

export function StudentQueue({ registrations, onApprove, onReject, emptyMessage = "No registrations yet." }: StudentQueueProps) {
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
      await onApprove(id);
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
      await onReject(id, reason.trim());
      router.refresh();
      setRejectingId(null);
      setReason("");
    } finally {
      setBusyId(null);
    }
  }

  if (registrations.length === 0) {
    return <div className="glass-surface p-8 text-center text-sm text-slate-500">{emptyMessage}</div>;
  }

  return (
    <div className="space-y-3">
      {registrations.map((reg) => (
        <div key={reg.id} className="glass-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <Avatar image={reg.user?.image} name={reg.fullName} />
              <div>
                <h3 className="font-serif text-lg text-slate-50">{reg.fullName}</h3>
                <p className="mt-0.5 text-sm text-slate-500">
                  {INSTRUMENT_LABEL[reg.instrument]} · {SKILL_LABEL[reg.skillLevel]}
                  {reg.user?.username && <> · @{reg.user.username}</>}
                </p>
              </div>
            </div>
            <span
              className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${STATUS_STYLE[reg.status]}`}
            >
              {STATUS_LABEL[reg.status]}
            </span>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-slate-600">Email</dt>
              <dd className="text-slate-300">{reg.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-600">Phone</dt>
              <dd className="text-slate-300">{reg.phone}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-600">Submitted</dt>
              <dd className="text-slate-300">{new Date(reg.createdAt).toLocaleString()}</dd>
            </div>
          </dl>

          {reg.notes && <p className="mt-3 text-sm text-slate-500">Note: {reg.notes}</p>}
          {reg.status === "REJECTED" && reg.rejectionReason && (
            <p className="mt-2 text-sm text-red-400">Rejected: {reg.rejectionReason}</p>
          )}
          {reg.status !== "PENDING" && reg.reviewedBy && (
            <p className="mt-2 text-xs text-slate-600">Reviewed by {reg.reviewedBy.name ?? "an admin"}</p>
          )}

          {reg.status !== "PENDING" ? null : rejectingId === reg.id ? (
            <div className="mt-4 space-y-2">
              <textarea
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why isn't this a fit right now?"
                rows={2}
                className="w-full resize-none glass-surface-subtle px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-red-400/60"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRejectingId(null);
                    setReason("");
                  }}
                  disabled={busyId === reg.id}
                  className="flex-1 rounded-lg border border-ink/10 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleReject(reg.id)}
                  disabled={busyId === reg.id || !reason.trim()}
                  className="flex flex-1 items-center justify-center rounded-lg bg-red-500/95 py-2 text-sm font-semibold text-slate-950 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busyId === reg.id && <MorphingSquare size={13} className="mr-1.5 shrink-0" />}
                  {busyId === reg.id ? "Rejecting…" : "Confirm reject"}
                </button>
              </div>
            </div>
          ) : approvingId === reg.id ? (
            <div className="mt-4 space-y-2">
              <p className="text-sm text-slate-400">Approve {reg.fullName}&apos;s registration?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setApprovingId(null)}
                  disabled={busyId === reg.id}
                  className="flex-1 rounded-lg border border-ink/10 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleApprove(reg.id)}
                  disabled={busyId === reg.id}
                  className="cta-sheen cta-fill flex flex-1 items-center justify-center rounded-lg py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
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
                className="flex-1 rounded-lg border border-ink/10 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => setApprovingId(reg.id)}
                disabled={busyId === reg.id}
                className="cta-sheen cta-fill flex-1 rounded-lg py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                Approve
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

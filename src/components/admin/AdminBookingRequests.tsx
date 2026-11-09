"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/classScheduleLabels";

export interface RequestGroupView {
  key: string;
  scheduledAt: string;
  label: string | null;
  alreadyBooked: boolean;
  requests: { id: string; studentName: string; email: string; createdAt: string }[];
}

type Result = { ok: true } | { ok: false; error: string };

function ago(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** The queue of times students asked for. The earliest request for an hour is first; confirming one books it and tells the others. */
export function AdminBookingRequests({
  groups,
  requestMode,
  showSettingsLink,
  onConfirm,
  onDecline,
}: {
  groups: RequestGroupView[];
  requestMode: boolean;
  showSettingsLink: boolean;
  onConfirm: (requestId: string) => Promise<Result>;
  onDecline: (requestId: string, reason?: string) => Promise<Result>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; text: string } | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  function run(id: string, work: () => Promise<Result>) {
    setBusyId(id);
    setError(null);
    start(async () => {
      const result = await work();
      setBusyId(null);
      if (!result.ok) return setError({ id, text: result.error });
      setDecliningId(null);
      setReason("");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      <p className={`rounded-control px-3.5 py-2.5 text-small ${requestMode ? "bg-[rgb(var(--signal)/0.1)] text-slate-200" : "bg-neu-base text-slate-400 shadow-pressed-low"}`}>
        {requestMode ? "Request mode is on. Students ask for times and you confirm them." : "Request mode is off. Students book their own times."}
        {showSettingsLink && (
          <>
            {" "}
            <Link href="/admin/settings" className="font-medium text-signal underline-offset-4 hover:underline">Change in Settings</Link>
          </>
        )}
      </p>

      {groups.length === 0 && (
        <div className="rounded-card bg-neu-base px-4 py-10 text-center text-small text-slate-400 shadow-raised-low">No requests waiting.</div>
      )}

      {groups.map((group) => (
        <section key={group.key} className="rounded-card bg-neu-base p-4 shadow-raised-low">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-body font-semibold text-slate-50">{formatDateTime(group.scheduledAt)}</h3>
            <p className="text-small text-slate-400">
              {group.label ? `${group.label} · ` : ""}
              {group.requests.length} {group.requests.length === 1 ? "request" : "requests"}
            </p>
          </div>
          {group.alreadyBooked && <p className="mt-2 text-small text-amber-300">Someone is already booked at this time, so these can only be declined.</p>}
          <ul className="mt-3 grid gap-2">
            {group.requests.map((request, index) => (
              <li key={request.id} className="rounded-control bg-neu-base p-3 shadow-pressed-low">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-small font-medium text-slate-100">
                      {index === 0 && group.requests.length > 1 && <span className="mr-2 rounded-full bg-[rgb(var(--signal)/0.16)] px-2 py-0.5 text-signal">First</span>}
                      {request.studentName}
                    </p>
                    <p className="truncate text-small text-slate-400">
                      {request.email} · asked {ago(request.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" disabled={group.alreadyBooked || (pending && busyId === request.id)} loading={pending && busyId === request.id && decliningId !== request.id} onClick={() => run(request.id, () => onConfirm(request.id))}>
                      Confirm
                    </Button>
                    <Button size="sm" variant="secondary" disabled={pending && busyId === request.id} onClick={() => setDecliningId(decliningId === request.id ? null : request.id)}>
                      Decline
                    </Button>
                  </div>
                </div>
                {decliningId === request.id && (
                  <div className="mt-3 grid gap-2">
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={200}
                      placeholder="Reason (optional), sent to the student"
                      className="h-10 w-full rounded-control border border-(--neu-edge) bg-neu-base px-3 text-body text-slate-50 shadow-pressed-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <div>
                      <Button size="sm" variant="danger" loading={pending && busyId === request.id} onClick={() => run(request.id, () => onDecline(request.id, reason))}>
                        Decline and tell them
                      </Button>
                    </div>
                  </div>
                )}
                {error?.id === request.id && <p role="alert" className="mt-2 text-small text-red-400">{error.text}</p>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "@/components/ui/appIcons";
import { formatDateTime } from "@/lib/classScheduleLabels";
import { addCreditLabel } from "@/lib/adminBookingRules";
import { newIdempotencyKey } from "@/lib/idempotencyClient";
import { Callout, Meta } from "@/components/ui/CardKit";

export interface RequestGroupView {
  key: string;
  scheduledAt: string;
  label: string | null;
  alreadyBooked: boolean;
  requests: { id: string; studentId: string; studentName: string; email: string; createdAt: string }[];
}

type Result = { ok: true } | { ok: false; error: string; shortBy?: number; canAddCredit?: boolean };

function ago(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/**
 * The queue of times students asked for. The earliest request for an hour is first; confirming one books it and tells the others.
 * A student with no free credit is named in the answer, and the owner can add the credit and confirm right there.
 */
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
  onConfirm: (requestId: string, opts?: { addCredit?: boolean; key?: string }) => Promise<Result>;
  onDecline: (requestId: string, reason?: string) => Promise<Result>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; text: string; shortBy?: number; canAdd?: boolean } | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  // One once-only key per confirm attempt, renewed after each success, so a double tap books once.
  const [key, setKey] = useState(() => newIdempotencyKey());

  function run(id: string, work: () => Promise<Result>) {
    setBusyId(id);
    setError(null);
    start(async () => {
      let result: Result;
      try {
        result = await work();
      } catch {
        result = { ok: false, error: "Something went wrong. Try again." };
      }
      setBusyId(null);
      if (!result.ok) return setError({ id, text: result.error, shortBy: result.shortBy, canAdd: result.canAddCredit });
      setKey(newIdempotencyKey());
      setDecliningId(null);
      setReason("");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      {/* The mode is a quiet state line, not a card: the requests below are the point of the screen. */}
      <Callout
        tone="neutral"
        className={requestMode ? "bg-signal/10" : undefined}
        action={
          showSettingsLink ? (
            <Link href="/admin/settings" className="tap inline-flex items-center text-small font-medium text-signal-fg underline-offset-4 hover:underline">
              Change in Settings
            </Link>
          ) : undefined
        }
      >
        {requestMode ? "Request mode is on. Students ask for times and you confirm them." : "Request mode is off. Students book their own times."}
      </Callout>

      {groups.length === 0 && (
        <div className="rounded-card bg-neu-base px-4 py-10 text-center text-small text-slate-400 shadow-raised-low">No requests waiting.</div>
      )}

      {groups.map((group) => (
        <section key={group.key} className="overflow-hidden rounded-card bg-neu-base shadow-raised-mid">
          {/* The asked-for time is the group's heading and focal point; the label and the count are quiet beside it. */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 pb-3 pt-4">
            <h3 className="text-title font-semibold tabular-nums text-slate-50">{formatDateTime(group.scheduledAt)}</h3>
            <Meta items={[group.label, `${group.requests.length} ${group.requests.length === 1 ? "request" : "requests"}`]} />
          </div>
          {group.alreadyBooked && (
            <Callout tone="warning" className="mx-4 mb-3">
              Someone is already booked at this time, so these can only be declined.
            </Callout>
          )}
          <ul className="divide-y divide-slate-50/8 border-t border-slate-50/8">
            {group.requests.map((request, index) => {
              // The earliest request is the one to confirm, so it alone gets the filled button; the rest stay quiet.
              const first = index === 0;
              return (
              <li key={request.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex min-w-0 items-center text-body font-semibold text-slate-50">
                      {first && group.requests.length > 1 && <span className="mr-2 shrink-0 text-small font-medium text-signal-fg">First</span>}
                      {/* The name opens their page (credits, plan, classes) without leaving the job half done. */}
                      <Link
                        href={`/admin/users/${request.studentId}`}
                        className="group inline-flex min-w-0 items-center gap-1.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="truncate">{request.studentName}</span>
                        <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-400" />
                      </Link>
                    </p>
                    <p className="truncate text-small text-slate-500">
                      {request.email} · asked {ago(request.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant={first && !group.alreadyBooked ? "primary" : "secondary"}
                      disabled={group.alreadyBooked || (pending && busyId === request.id)}
                      loading={pending && busyId === request.id && decliningId !== request.id}
                      onClick={() => run(request.id, () => onConfirm(request.id, { key }))}
                    >
                      Confirm
                    </Button>
                    <Button size="sm" variant="ghost" className="text-slate-400" disabled={pending && busyId === request.id} onClick={() => setDecliningId(decliningId === request.id ? null : request.id)}>
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
                {error?.id === request.id && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <p role="alert" className="text-small text-red-400">{error.text}</p>
                    {error.shortBy && error.canAdd && !group.alreadyBooked && (
                      <Button size="sm" variant="secondary" disabled={pending && busyId === request.id} onClick={() => run(request.id, () => onConfirm(request.id, { addCredit: true, key }))}>
                        {addCreditLabel(error.shortBy, "confirm")}
                      </Button>
                    )}
                  </div>
                )}
              </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

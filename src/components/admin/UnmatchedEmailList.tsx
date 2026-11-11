"use client";

import { NotifyToggle, useNotifyStudent } from "@/components/admin/NotifyToggle";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/Toaster";
import { AdminEmptyState as EmptyState } from "@/components/admin/AdminEmptyState";
import { Mail, Search } from "@/components/ui/appIcons";
import { StatusDot } from "@/components/ui/StatusDot";
import { newIdempotencyKey } from "@/lib/idempotencyClient";
import { Hint } from "@/components/ui/Hint";
import { CardFoot, Meta } from "@/components/ui/CardKit";

export interface UnmatchedEmailRow {
  id: string;
  method: string;
  senderName: string;
  amountCents: number;
  memo: string | null;
  /** Last four digits of the phone the email showed for the sender, if any. */
  senderPhoneLast4: string | null;
  receivedAtMs: number;
  candidates: { id: string; status: string; studentName: string | null; studentEmail: string; createdAtMs: number; phoneMatch: boolean; score: number; reasons: string[] }[];
  confidence: "strong" | "likely" | "weak";
}

type Result = { ok: boolean; error: string | null };

/** What attaching an email to one person would pay (from the server's preview). */
export interface ReceiptStudentTargetView {
  userId: string;
  studentName: string;
  billLabel: string;
  amountCents: number | null;
  opensEarly: boolean;
}

type FindStudents = (query: string) => Promise<{ id: string; name: string | null; email: string }[]>;
type PreviewStudent = (receiptId: string, userId: string) => Promise<{ ok: true; target: ReceiptStudentTargetView } | { ok: false; error: string }>;
type AttachToStudent = (receiptId: string, userId: string, notify?: boolean, key?: string) => Promise<Result>;

const STATUS_LABEL: Record<string, string> = { AWAITING_TRANSFER: "awaiting transfer", PENDING_REVIEW: "pending review" };

function usd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function ago(ms: number): string {
  const minutes = Math.floor((Date.now() - ms) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Payment emails that matched nobody. Each can be attached to an open payment for the same amount, or dismissed. */
export function UnmatchedEmailList({
  rows,
  onMatch,
  onDismiss,
  onIgnoreSender,
  onFindStudents,
  onPreviewStudent,
  onAttachToStudent,
}: {
  rows: UnmatchedEmailRow[];
  onMatch: (receiptId: string, paymentId: string, notify?: boolean) => Promise<Result>;
  onDismiss: (receiptId: string) => Promise<Result>;
  /** Owner only: skip every bank email from this sender's full name from now on (their own transfers). */
  onIgnoreSender?: (receiptId: string) => Promise<Result>;
  /** Owner only, all three: find the person who paid when no open payment fits (they paid before their bill opened). */
  onFindStudents?: FindStudents;
  onPreviewStudent?: PreviewStudent;
  onAttachToStudent?: AttachToStudent;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notify, setNotify] = useNotifyStudent("payments", true);
  // Attaching approves real money, so it takes a second click, like Approve in the payment list.
  const [confirming, setConfirming] = useState<{ receiptId: string; paymentId: string | "dismiss" | "ignore" } | null>(null);
  const [error, setError] = useState<{ receiptId: string; message: string } | null>(null);
  const [finding, setFinding] = useState<string | null>(null);
  // Owner only: "Find the student" for an email no open payment fits (they paid before their bill opened).
  const finder = onFindStudents && onPreviewStudent && onAttachToStudent ? { find: onFindStudents, preview: onPreviewStudent, attach: onAttachToStudent } : null;
  const findable = finder !== null;

  async function run(receiptId: string, action: () => Promise<Result>, done: { title: string; description?: string }) {
    setBusy(receiptId);
    setError(null);
    let result: Result;
    try {
      const hold = await toast.held(done.title, action, { mail: true });
      if (hold.undone) {
        setBusy(null);
        return;
      }
      result = hold.value;
    } catch {
      result = { ok: false, error: "It did not go through. Try again." };
    }
    setBusy(null);
    if (!result.ok) {
      const message = result.error ?? "Something went wrong.";
      setError({ receiptId, message });
      toast.error(`Couldn't finish: ${done.title.toLowerCase()}`, { description: message });
      return;
    }
    toast.success(done.title, { description: done.description });
    setConfirming(null);
    router.refresh();
  }

  if (rows.length === 0) {
    return <EmptyState icon={<Mail />} title="All bank emails are matched" description="An email that cannot find its payment by itself waits here for you." />;
  }

  return (
    <div className="space-y-3">
    <NotifyToggle on={notify} onChange={setNotify} label="Notify the student (result and receipt) when I attach an email" />
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.id} className="rounded-card bg-neu-base p-4 shadow-raised-mid md:p-5">
          {/* The focal point: who sent how much. How and when is one quiet line under it. */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-title font-semibold text-slate-50">{row.senderName}</p>
              <Meta
                className="mt-0.5"
                items={[row.method === "VENMO" ? "Venmo" : "Zelle", ago(row.receivedAtMs), row.senderPhoneLast4 ? `Phone ends in ${row.senderPhoneLast4}` : null]}
              />
            </div>
            <p className="shrink-0 text-headline font-semibold tabular-nums text-slate-50">{usd(row.amountCents)}</p>
          </div>
          {row.memo && <p className="mt-2 text-small text-slate-400">&ldquo;{row.memo}&rdquo;</p>}

          {row.candidates.length === 0 ? (
            <p className="mt-4 text-small text-slate-500">No open payment for {usd(row.amountCents)} yet.{findable ? " If they paid before their bill opened, find the student." : ""}</p>
          ) : (
            <div className="mt-4">
              <p className="flex items-center gap-1.5 text-caption font-medium uppercase tracking-caps text-slate-500">
                Open payments for {usd(row.amountCents)}
                <Hint>Attaching also remembers &ldquo;{row.senderName}&rdquo; as a name this student pays under, so their next payment clears by itself.</Hint>
              </p>
              {/* Each open payment is a row: the student first, the facts in one quiet line, the action on the right. The best match is the
                  one orange button on the card. */}
              <ul className="mt-2 divide-y divide-slate-50/6 overflow-hidden rounded-control bg-slate-50/4 ring-1 ring-inset ring-slate-50/8">
                {row.candidates.map((c, i) => {
                  const isConfirming = confirming?.receiptId === row.id && confirming.paymentId === c.id;
                  const who = c.studentName ? `${c.studentName} (${c.studentEmail})` : c.studentEmail;
                  const best = i === 0 && row.confidence !== "weak";
                  return (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="truncate text-body font-medium text-slate-50">{c.studentName ?? c.studentEmail}</span>
                          {best && <StatusDot tone="success">{row.confidence === "strong" ? "Best match" : "Likely"}</StatusDot>}
                        </p>
                        <Meta
                          className="mt-0.5"
                          items={[
                            c.studentName ? c.studentEmail : null,
                            `${STATUS_LABEL[c.status] ?? c.status.toLowerCase()}, started ${ago(c.createdAtMs)}`,
                            c.phoneMatch ? "phone matches" : null,
                            ...c.reasons,
                          ]}
                        />
                      </div>
                      {isConfirming ? (
                        <span className="flex gap-2">
                          <button type="button" onClick={() => setConfirming(null)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={busy === row.id}
                            onClick={() => run(row.id, () => onMatch(row.id, c.id, notify), { title: "Email attached, payment approved", description: who })}
                            className={buttonVariants({ variant: "primary", size: "sm" })}
                          >
                            {busy === row.id && <MorphingSquare size={14} className="mr-1.5 shrink-0" />}
                            {busy === row.id ? "Approving…" : "Confirm: approve"}
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirming({ receiptId: row.id, paymentId: c.id })}
                          className={buttonVariants({ variant: best ? "primary" : "secondary", size: "sm" })}
                        >
                          Attach and approve
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {error?.receiptId === row.id && (
            <p role="alert" className="mt-3 text-small text-red-400">
              {error.message}
            </p>
          )}

          {finder && finding === row.id && (
            <StudentFinder
              row={row}
              notify={notify}
              onFind={finder.find}
              onPreview={finder.preview}
              onAttach={finder.attach}
              onClose={() => setFinding(null)}
            />
          )}

          {confirming?.receiptId === row.id && confirming.paymentId === "dismiss" ? (
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-50/8 pt-3">
              <span className="mr-auto text-small text-slate-400">It will stop being counted. This does not touch any payment.</span>
              <button type="button" onClick={() => setConfirming(null)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                Cancel
              </button>
              <button
                type="button"
                disabled={busy === row.id}
                onClick={() => run(row.id, () => onDismiss(row.id), { title: "Email dismissed" })}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                {busy === row.id && <MorphingSquare size={14} className="mr-1.5 shrink-0" />}
                {busy === row.id ? "Dismissing…" : "Dismiss it"}
              </button>
            </div>
          ) : confirming?.receiptId === row.id && confirming.paymentId === "ignore" && onIgnoreSender ? (
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-50/8 pt-3">
              <span className="mr-auto text-small text-slate-400">
                Every email from &ldquo;{row.senderName}&rdquo; is skipped from now on, and the ones waiting here are dismissed. No payment is touched. Undo it in Settings &gt; Payments.
              </span>
              <button type="button" onClick={() => setConfirming(null)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                Cancel
              </button>
              <button
                type="button"
                disabled={busy === row.id}
                onClick={() => run(row.id, () => onIgnoreSender(row.id), { title: "Sender ignored from now on", description: row.senderName })}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                {busy === row.id && <MorphingSquare size={14} className="mr-1.5 shrink-0" />}
                {busy === row.id ? "Saving…" : "Yes, always ignore"}
              </button>
            </div>
          ) : (
            // Setting an email aside is the quiet way out, so it sits in the foot as text buttons, never louder than attaching.
            <CardFoot>
              {onIgnoreSender && (
                <button type="button" onClick={() => setConfirming({ receiptId: row.id, paymentId: "ignore" })} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  Always ignore this sender
                </button>
              )}
              <button type="button" onClick={() => setConfirming({ receiptId: row.id, paymentId: "dismiss" })} className={buttonVariants({ variant: row.candidates.length === 0 && !findable ? "secondary" : "ghost", size: "sm" })}>
                Not a studio payment
              </button>
              {/* With no open payment to attach to, finding the person who paid is the next step, so it is the card's one orange button. */}
              {findable && finding !== row.id && (
                <button type="button" onClick={() => setFinding(row.id)} className={buttonVariants({ variant: row.candidates.length === 0 ? "primary" : "secondary", size: "sm" })}>
                  <Search aria-hidden className="mr-1.5 h-3.5 w-3.5" />
                  Find the student…
                </button>
              )}
            </CardFoot>
          )}
        </li>
      ))}
    </ul>
    </div>
  );
}

/**
 * "Find the student": for an email no open payment fits, usually someone who paid a few days before their bill opened. Pick the
 * person; the server says which bill it would pay (opening their next one when it is not open yet) and refuses a different amount,
 * naming the bill's. Attaching approves it, so it takes a second tap.
 */
function StudentFinder({
  row,
  notify,
  onFind,
  onPreview,
  onAttach,
  onClose,
}: {
  row: UnmatchedEmailRow;
  notify: boolean;
  onFind: FindStudents;
  onPreview: PreviewStudent;
  onAttach: AttachToStudent;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(row.senderName.split(" ")[0] ?? "");
  const [people, setPeople] = useState<{ id: string; name: string | null; email: string }[] | null>(null);
  const [picked, setPicked] = useState<ReceiptStudentTargetView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(() => newIdempotencyKey());

  // The list follows the box, a moment after the last key.
  useEffect(() => {
    let live = true;
    const t = window.setTimeout(async () => {
      const found = await onFind(query).catch(() => []);
      if (live) setPeople(found.slice(0, 8));
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [query, onFind]);

  async function pick(userId: string) {
    setBusy(true);
    setProblem(null);
    setPicked(null);
    setSure(false);
    const result = await onPreview(row.id, userId).catch(() => ({ ok: false as const, error: "Something went wrong. Nothing was changed." }));
    setBusy(false);
    if (!result.ok) return setProblem(result.error);
    setPicked(result.target);
  }

  async function attach() {
    if (!picked) return;
    setBusy(true);
    let result: Result;
    try {
      const hold = await toast.held("Attaching the email", () => onAttach(row.id, picked.userId, notify, key), { mail: true });
      if (hold.undone) return setBusy(false);
      result = hold.value;
    } catch {
      result = { ok: false, error: "It did not go through. Try again." };
    }
    setBusy(false);
    if (!result.ok) {
      setSure(false);
      return setProblem(result.error ?? "Something went wrong.");
    }
    setKey(newIdempotencyKey());
    toast.success("Email attached, payment approved", { description: picked.studentName });
    onClose();
    router.refresh();
  }

  return (
    <div className="mt-4 space-y-2 rounded-control bg-slate-50/4 p-3 ring-1 ring-inset ring-slate-50/8">
      <div className="flex items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search a name or email</span>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPicked(null);
              setProblem(null);
            }}
            placeholder="Search a name or email"
            className="h-11 w-full rounded-control border border-(--field-edge) bg-neu-base pl-9 pr-3 text-body text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <button type="button" onClick={onClose} className={buttonVariants({ variant: "secondary", size: "sm" })}>
          Close
        </button>
      </div>

      {!picked && people && people.length === 0 && <p className="text-small text-slate-500">Nobody matches that.</p>}
      {!picked && people && people.length > 0 && (
        <ul className="divide-y divide-slate-50/6">
          {people.map((p) => (
            <li key={p.id}>
              <button type="button" disabled={busy} onClick={() => void pick(p.id)} className="tap flex w-full items-center justify-between gap-2 py-2 text-left text-small text-slate-200 hover:text-slate-50 disabled:opacity-60">
                <span className="min-w-0 truncate">
                  <span className="font-medium text-slate-50">{p.name ?? p.email}</span>
                  {p.name && <span className="text-slate-500"> · {p.email}</span>}
                </span>
                <span className="shrink-0 text-slate-500">Pick</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {busy && !picked && (
        <p className="inline-flex items-center gap-2 text-small text-slate-400">
          <MorphingSquare size={12} />
          Checking their bill
        </p>
      )}
      {problem && (
        <p role="alert" className="text-small text-red-400">
          {problem}
        </p>
      )}

      {picked && (
        <div className="space-y-2">
          <p className="text-small text-slate-200">
            <span className="font-medium text-slate-50">{picked.studentName}</span> · {picked.billLabel}
            {picked.amountCents !== null ? ` · ${usd(picked.amountCents)}` : ""}
          </p>
          {picked.opensEarly && (
            <p className="text-small text-slate-400">
              Their bill is not open yet, so attaching opens it now and pays it with this email.
              {picked.amountCents === null ? ` It must come to ${usd(row.amountCents)} or nothing is paid.` : ""}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {sure ? (
              <>
                <button type="button" disabled={busy} onClick={() => setSure(false)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                  Cancel
                </button>
                <button type="button" disabled={busy} onClick={() => void attach()} className={buttonVariants({ variant: "primary", size: "sm" })}>
                  {busy && <MorphingSquare size={14} className="mr-1.5 shrink-0" />}
                  {busy ? "Approving…" : "Confirm: approve"}
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setPicked(null)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                  Pick someone else
                </button>
                <button type="button" onClick={() => setSure(true)} className={buttonVariants({ variant: "primary", size: "sm" })}>
                  Attach and approve
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

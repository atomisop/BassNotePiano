"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown } from "@/components/ui/appIcons";
import { buttonVariants } from "@/components/ui/button";
import { PulsatingDots } from "@/components/ui/pulsating-loader";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { toast } from "@/components/ui/Toaster";
import { NotifyPlaceToggle, useNotifyStudent } from "@/components/admin/NotifyToggle";
import { cn } from "@/lib/utils";
import { newIdempotencyKey } from "@/lib/idempotencyClient";
import type { NeedsYouItem, NeedsYouKind, NeedsYouRow } from "@/lib/needsYou";
import { needsYouItemsAction, releaseNextScaleAction } from "@/app/(dashboard)/admin/inplace-actions";
import { approvePaymentAction, checkPaymentAction } from "@/app/(dashboard)/admin/payments/actions";
import { confirmBookingRequestAction, markAttendanceAction } from "@/app/(dashboard)/admin/schedule/actions";
import { sendFollowUpReminderAction } from "@/app/(dashboard)/admin/followup-actions";

/** The "Notify students" choice each kind of row shares with the page its job usually lives on (payments are told by default). */
const NOTIFY_PLACE: Partial<Record<NeedsYouKind, { place: string; defaultOn: boolean; label: string }>> = {
  payments: { place: "payments", defaultOn: true, label: "Notify students when I approve" },
  unmarked: { place: "attendance", defaultOn: false, label: "Notify students when I mark" },
  scales: { place: "scales", defaultOn: false, label: "Notify students when I approve" },
};

const PANEL = "mt-3 divide-y divide-slate-50/8 overflow-hidden rounded-card bg-slate-50/4 ring-1 ring-inset ring-slate-50/8";

/**
 * The Overview's Needs you rows. A row with things behind it opens right here with the first three and each one's main action (approve
 * the payment, mark the class, release the scale, answer the request, send the reminder), and "See all" for the rest on their page.
 */
export function NeedsYouList({ rows }: { rows: NeedsYouRow[] }) {
  return (
    <ul className={PANEL}>
      {rows.map((row) => (
        <li key={row.id}>{row.expandable ? <OpenableRow row={row} /> : <PlainRow row={row} />}</li>
      ))}
    </ul>
  );
}

/** Each row leads with its count, so the owner reads "3" before reading what it is (overdue bills in red). */
function RowLabel({ row }: { row: NeedsYouRow }) {
  return (
    <>
      <span className={cn("min-w-8 text-title font-semibold tabular-nums", row.id === "overdue" ? "text-red-400" : "text-slate-50")}>{row.count}</span>
      <span className="min-w-0 flex-1 text-body text-slate-300">{row.text.replace(/^\d+\s+/, "")}</span>
    </>
  );
}

function PlainRow({ row }: { row: NeedsYouRow }) {
  return (
    <Link href={row.href} className="group tap flex items-center gap-3 px-4 py-3 hover:bg-slate-50/5">
      <RowLabel row={row} />
      <ArrowRight aria-hidden className="h-4 w-4 shrink-0 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-slate-300" />
    </Link>
  );
}

function OpenableRow({ row }: { row: NeedsYouRow }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NeedsYouItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const notifyPlace = NOTIFY_PLACE[row.id];

  async function load() {
    setFailed(false);
    try {
      setItems((await needsYouItemsAction(row.id)).items);
    } catch {
      setFailed(true);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    // Read fresh each time it opens, so an item handled elsewhere is not offered again.
    if (next) {
      setItems(null);
      void load();
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="tap flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50/5"
      >
        <RowLabel row={row} />
        <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 text-slate-500 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div id={panelId} className="space-y-2 px-4 pb-4">
          {notifyPlace && <NotifyPlaceToggle place={notifyPlace.place} defaultOn={notifyPlace.defaultOn} label={notifyPlace.label} />}
          {failed ? (
            <p className="text-small text-red-300">
              Could not load these.{" "}
              <button type="button" onClick={() => void load()} className="tap inline-flex items-center underline underline-offset-4">
                Try again
              </button>
            </p>
          ) : items === null ? (
            <PulsatingDots className="justify-start py-2" />
          ) : items.length === 0 ? (
            <p className="text-small text-slate-400">All done here.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <ItemRow key={item.key} kind={row.id} item={item} notifyPlace={notifyPlace} onDone={() => setItems((prev) => (prev ?? []).filter((i) => i.key !== item.key))} />
              ))}
            </ul>
          )}
          <Link href={row.href} className="tap inline-flex items-center gap-1 text-small font-medium text-slate-300 underline underline-offset-4 hover:text-slate-50">
            See all {row.count}
            <ArrowRight aria-hidden className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}

function ItemRow({
  kind,
  item,
  notifyPlace,
  onDone,
}: {
  kind: NeedsYouKind;
  item: NeedsYouItem;
  notifyPlace?: { place: string; defaultOn: boolean };
  onDone: () => void;
}) {
  const router = useRouter();
  const [notify] = useNotifyStudent(notifyPlace?.place ?? "needs-you", notifyPlace?.defaultOn ?? false);
  const [busy, setBusy] = useState<string | null>(null);
  const key = useRef(newIdempotencyKey());
  const first = item.title.split(/[ ,]/)[0];

  /** Runs one action; a result object with ok:false (or a throw) shows its message and keeps the item. */
  async function run(label: string, work: () => Promise<{ ok: boolean; error?: string; message?: string } | void>, success: string, heldTitle?: string) {
    setBusy(label);
    try {
      let result: { ok: boolean; error?: string; message?: string } | void;
      if (heldTitle) {
        // Held a few seconds with Undo, as on Billing > Payments: approving starts a plan and sends a receipt.
        const h = await toast.held(heldTitle, () => work(), { mail: notify });
        if (h.undone) return;
        result = h.value;
      } else {
        result = await work();
      }
      if (result && !result.ok) return void toast.error(result.error ?? "That did not go through.");
      toast.success(success, { description: item.title });
      onDone();
      router.refresh();
    } catch (err) {
      toast.error("That did not go through", { description: err instanceof Error && err.message ? err.message : "Try again." });
    } finally {
      setBusy(null);
    }
  }

  const btn = buttonVariants({ variant: "secondary", size: "sm" });
  const action = item.action;
  return (
    <li className="flex flex-col gap-2 rounded-control bg-slate-50/4 p-3 sm:flex-row sm:items-center sm:justify-between">
      <Link href={item.href} className="min-w-0 hover:underline">
        <span className="block truncate text-small font-medium text-slate-50">{item.title}</span>
        {item.detail && <span className="block truncate text-small text-slate-500">{item.detail}</span>}
      </Link>
      {action && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {action.kind === "approvePayment" && (
            <button type="button" disabled={busy !== null} className={buttonVariants({ size: "sm" })} onClick={() => void run("go", () => approvePaymentAction(action.id, notify), "Payment approved", "Approving payment")}>
              {busy === "go" && <MorphingSquare size={12} className="shrink-0" />}
              Approve
            </button>
          )}
          {action.kind === "checkPayment" && (
            <button type="button" disabled={busy !== null} className={btn} onClick={() => void run("go", () => checkPaymentAction(action.id), "Marked as checked")}>
              {busy === "go" && <MorphingSquare size={12} className="shrink-0" />}
              Mark checked
            </button>
          )}
          {action.kind === "mark" && (
            <>
              <button type="button" disabled={busy !== null} className={btn} onClick={() => void run("present", () => markAttendanceAction(action.id, "PRESENT", notify), `${first}: present`)}>
                {busy === "present" && <MorphingSquare size={12} className="shrink-0" />}
                Present
              </button>
              <button
                type="button"
                disabled={busy !== null}
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-red-300 hover:text-red-200")}
                onClick={() => void run("noshow", () => markAttendanceAction(action.id, "NO_SHOW", notify), `${first}: no-show`)}
              >
                {busy === "noshow" && <MorphingSquare size={12} className="shrink-0" />}
                No-show
              </button>
            </>
          )}
          {action.kind === "approveScale" && (
            <button
              type="button"
              disabled={busy !== null}
              className={btn}
              onClick={() =>
                void run("go", async () => {
                  const r = await releaseNextScaleAction(action.id, false, notify, key.current);
                  if (r.ok) key.current = newIdempotencyKey();
                  return r;
                }, "Next scale released")
              }
            >
              {busy === "go" && <MorphingSquare size={12} className="shrink-0" />}
              Approve scale
            </button>
          )}
          {action.kind === "confirmRequest" && (
            <button type="button" disabled={busy !== null} className={btn} onClick={() => void run("go", () => confirmBookingRequestAction(action.id), "Booked")}>
              {busy === "go" && <MorphingSquare size={12} className="shrink-0" />}
              Book it
            </button>
          )}
          {action.kind === "remind" && (
            <button type="button" disabled={busy !== null} className={btn} onClick={() => void run("go", () => sendFollowUpReminderAction("overdue", action.id), "Reminder sent")}>
              {busy === "go" && <MorphingSquare size={12} className="shrink-0" />}
              Send reminder
            </button>
          )}
        </div>
      )}
      {kind === "support" && !action && (
        <Link href={item.href} className={cn(btn, "shrink-0")}>
          Reply
        </Link>
      )}
    </li>
  );
}

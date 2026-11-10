"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, EllipsisVertical, MapPin, MessageSquare, NotebookPen, Sparkles, X } from "@/components/ui/appIcons";
import { DiscordIcon } from "@/components/ui/icons";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog } from "@/components/ui/Dialog";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { SwitchLook } from "@/components/ui/switch";
import { toast } from "@/components/ui/Toaster";
import { SlotCalendarPicker, type BookedTime, type PickerSlot } from "@/components/admin/SlotCalendarPicker";
import { QuickMessageButton } from "@/components/admin/QuickMessageButton";
import { StudentNotesEditor } from "@/components/admin/StudentNotesEditor";
import { useNotifyStudent } from "@/components/admin/NotifyToggle";
import { formatEtShort } from "@/lib/classScheduleLabels";
import { newIdempotencyKey } from "@/lib/idempotencyClient";
import { cn } from "@/lib/utils";
import type { NextScaleInfo } from "@/lib/nextScaleSummary";
import {
  adminCancelBookingAction,
  adminMoveBookingAction,
  adminMoveBookingToTimeAction,
  getOpenSlotsAction,
  setClassInPersonAction,
} from "@/app/(dashboard)/admin/schedule/actions";
import { notifyDiscordAction } from "@/app/(dashboard)/admin/discord/actions";
import { messageClassAction, releaseNextScaleAction } from "@/app/(dashboard)/admin/inplace-actions";

/** One class on a list (Today, Schedule > Attendance, the top bar's class panel, a support chat's account panel). */
export interface ClassActionRow {
  bookingId: string;
  studentId: string;
  name: string;
  /** ISO start time. */
  scheduledAt: string;
  /** Still SCHEDULED (no Present or No-show yet): only then can it be rescheduled or canceled. */
  active: boolean;
  inPerson?: boolean;
  discordConnected?: boolean;
  nextScale?: NextScaleInfo | null;
}

type Times = { open: PickerSlot[]; held: PickerSlot[]; booked: BookedTime[]; weekdays: number[] };

const CLASS_MS = 45 * 60_000;

/**
 * Reschedule for one class, the same box as the student page's Scheduler: any open weekly time or a typed start time, past days too,
 * with the same "this time does not exist yet" and "a plan keeps this time" questions.
 */
function RescheduleDialog({ row, open, onClose, notify, onDone }: { row: ClassActionRow; open: boolean; onClose: () => void; notify: boolean; onDone: () => void }) {
  const [times, setTimes] = useState<Times | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [picked, setPicked] = useState<PickerSlot | null>(null);
  const [ownTime, setOwnTime] = useState("");
  const [confirmNew, setConfirmNew] = useState(false);
  const [planHold, setPlanHold] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || times) return;
    let live = true;
    getOpenSlotsAction()
      .then((t) => live && setTimes({ open: t.open, held: t.held, booked: t.booked.filter((b) => b.id !== row.bookingId), weekdays: t.weekdays }))
      .catch(() => live && setError("Could not load the open times."));
    return () => {
      live = false;
    };
  }, [open, times, row.bookingId]);

  function reset() {
    setTimes(null);
    setDay(null);
    setPicked(null);
    setOwnTime("");
    setConfirmNew(false);
    setPlanHold(null);
    setError(null);
  }

  const useOwn = Boolean(day && ownTime && !picked);

  async function move(overridePlanHold = false) {
    if (!useOwn && !picked) return;
    if (useOwn && !confirmNew) return setConfirmNew(true);
    if (!useOwn && picked?.heldBy && !overridePlanHold) return setPlanHold(picked.heldBy);
    setBusy(true);
    setError(null);
    const result = await (useOwn
      ? adminMoveBookingToTimeAction(row.bookingId, day!, ownTime, notify, overridePlanHold)
      : adminMoveBookingAction(row.bookingId, picked!.scheduleId, picked!.occurrenceDateMs, picked!.chunkIndex, notify, overridePlanHold)
    ).catch(() => ({ ok: false as const, error: "Something went wrong.", planHold: false }));
    setBusy(false);
    if (!result.ok) {
      // A typed time that lands on a plan's weekly time is only found out by the server: ask, then try again.
      if (result.planHold && !overridePlanHold) return setPlanHold("another student");
      return setError(result.error);
    }
    toast.success(`${row.name.split(" ")[0]}'s class rescheduled`);
    reset();
    onDone();
  }

  const first = row.name.split(" ")[0];
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) {
          reset();
          onClose();
        }
      }}
      title={`Reschedule ${row.name}'s class`}
      description={`Now: ${formatEtShort(row.scheduledAt)}`}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {planHold || confirmNew ? (
            <>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => (planHold ? setPlanHold(null) : setConfirmNew(false))}>
                Back
              </Button>
              <Button type="button" disabled={busy} loading={busy} onClick={() => void move(Boolean(planHold))}>
                {planHold ? "Yes, move it here" : "Yes, create it and reschedule"}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => { reset(); onClose(); }}>
                Never mind
              </Button>
              <Button type="button" disabled={(!useOwn && !picked) || busy} loading={busy} onClick={() => void move()}>
                {useOwn ? `Reschedule to ${day} at ${ownTime}` : picked ? `Reschedule to ${formatEtShort(picked.scheduledAt)}` : "Pick a time"}
              </Button>
            </>
          )}
        </div>
      }
    >
      {planHold ? (
        <div className="rounded-xl border border-amber-300/40 bg-neu-base p-4 shadow-pressed-low">
          <p className="text-body font-semibold text-slate-50">This time belongs to a weekly plan</p>
          <p className="mt-1 text-small text-slate-300">
            {planHold === "another student" ? "Another student's" : `${planHold}'s`} plan keeps this weekly time, though nobody has a class in it this week. Move {first}&apos;s class here anyway?
          </p>
        </div>
      ) : confirmNew ? (
        <div className="rounded-xl border border-slate-50/35 bg-neu-base p-4 shadow-pressed-low">
          <p className="text-body font-semibold text-slate-50">This time does not exist yet</p>
          <p className="mt-1 text-small text-slate-300">
            {day} at {ownTime} is not one of your weekly times. Create it as a one-time slot and reschedule {first} there?
          </p>
        </div>
      ) : times === null ? (
        <p className="text-small text-slate-500">{error ? "" : "Loading open times…"}</p>
      ) : (
        <SlotCalendarPicker
          slots={times.open}
          booked={times.booked}
          weekdays={times.weekdays}
          allowAnyDay
          allowPast
          held={times.held}
          day={day}
          onDay={setDay}
          picked={picked}
          onPick={setPicked}
          ownTime={ownTime}
          onOwnTime={setOwnTime}
        />
      )}
      {error && <p role="alert" className="mt-3 text-small text-red-400">{error}</p>}
    </Dialog>
  );
}

/** Cancel one class (refunded), with an optional reason the student sees. */
function CancelDialog({ row, open, onClose, notify, onDone }: { row: ClassActionRow; open: boolean; onClose: () => void; notify: boolean; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    const hold = await toast.held("Canceling the class", () => adminCancelBookingAction(row.bookingId, reason.trim() || undefined, notify), { mail: notify });
    setBusy(false);
    if (hold.undone) return;
    if (!hold.value.ok) return setError(hold.value.error);
    toast.success(`${row.name.split(" ")[0]}'s class canceled and refunded`);
    setReason("");
    onDone();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) {
          setReason("");
          setError(null);
          onClose();
        }
      }}
      title={`Cancel ${row.name}'s class?`}
      description={`${formatEtShort(row.scheduledAt)}. The credit goes back.${notify ? " The student is told." : " The student is not told (Notify is off)."}`}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Keep it
          </Button>
          <Button type="button" variant="danger" disabled={busy} loading={busy} onClick={() => void cancel()}>
            Cancel class
          </Button>
        </div>
      }
    >
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={200}
        placeholder="Reason (optional, shown to the student)"
        aria-label="Reason"
        className="w-full rounded-control bg-neu-base px-3.5 py-2.5 text-body text-slate-100 shadow-pressed-low outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-ring"
      />
      {error && <p role="alert" className="mt-3 text-small text-red-400">{error}</p>}
    </Dialog>
  );
}

/**
 * The next scale for one student: Approve when it is ready, or the reason it is not yet with "Release anyway" (the teacher going past
 * the checklist or the weekly pace on purpose; a missing plan is never skipped).
 */
export function ScaleReleaseDialog({
  userId,
  name,
  scale,
  open,
  onClose,
  notify,
  onDone,
}: {
  userId: string;
  name: string;
  scale: NextScaleInfo;
  open: boolean;
  onClose: () => void;
  notify: boolean;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canForce, setCanForce] = useState(scale.state !== "READY");
  const key = useRef(newIdempotencyKey());
  // Each time the box opens it starts from the scale's state as the page last read it.
  useEffect(() => {
    if (open) setCanForce(scale.state !== "READY");
  }, [open, scale.state]);

  async function release(force: boolean) {
    setBusy(true);
    setError(null);
    const result = await releaseNextScaleAction(userId, force, notify, key.current).catch(() => ({ ok: false as const, error: "Something went wrong.", canForce: false }));
    setBusy(false);
    if (!result.ok) {
      setCanForce(result.canForce);
      return setError(result.error);
    }
    key.current = newIdempotencyKey();
    toast.success(`${result.message} for ${name.split(" ")[0]}`);
    onDone();
  }

  const why =
    scale.state === "NEEDS_CHECKLIST"
      ? "They have not finished the previous scale's lessons, practice and quiz yet."
      : scale.state === "WAITING_PACE" && scale.availableAt
        ? `One new scale a week: this one opens by the usual rules on ${new Date(scale.availableAt).toLocaleDateString("en-US", { month: "long", day: "numeric" })}.`
        : null;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) {
          setError(null);
          onClose();
        }
      }}
      title={`${scale.code}: ${scale.title}`}
      description={`${name}'s next scale. ${notify ? "They are told when it opens." : "They are not told (Notify is off)."}`}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Not now
          </Button>
          {scale.state === "READY" && !canForce ? (
            <Button type="button" disabled={busy} loading={busy} onClick={() => void release(false)}>
              Approve scale
            </Button>
          ) : canForce ? (
            <Button type="button" disabled={busy} loading={busy} onClick={() => void release(true)}>
              Release anyway
            </Button>
          ) : null}
        </div>
      }
    >
      {why && <p className="text-small text-slate-300">{why}</p>}
      {error && <p role="alert" className="mt-3 text-small text-red-400">{error}</p>}
    </Dialog>
  );
}

const iconBtn =
  "tap inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-50/6 hover:text-slate-200";

/**
 * Reschedule and Cancel as two small round buttons, for lists that show many classes (Schedule > Attendance, the top bar's class panel,
 * a support chat's account panel). `onDialogChange` lets a panel that closes on an outside tap stay open while a box is up.
 */
export function ClassMoveCancelButtons({
  row,
  notifyPlace,
  notifyDefaultOn = false,
  onDone,
  onDialogChange,
}: {
  row: ClassActionRow;
  notifyPlace: string;
  /** The same default as the place's switch, so the two agree before anyone has touched it. */
  notifyDefaultOn?: boolean;
  onDone?: () => void;
  onDialogChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const [notify] = useNotifyStudent(notifyPlace, notifyDefaultOn);
  const [open, setOpen] = useState<"move" | "cancel" | null>(null);
  const openRef = useRef(false);
  const show = (next: "move" | "cancel" | null) => {
    setOpen(next);
    openRef.current = next !== null;
    onDialogChange?.(next !== null);
  };
  // A row that leaves the list while its own box is up (the class changed elsewhere) must not leave its panel thinking a box is still open.
  const onDialogChangeRef = useRef(onDialogChange);
  onDialogChangeRef.current = onDialogChange;
  useEffect(
    () => () => {
      if (openRef.current) onDialogChangeRef.current?.(false);
    },
    [],
  );
  if (!row.active) return null;
  const done = () => {
    show(null);
    onDone?.();
    router.refresh();
  };
  return (
    <>
      <button type="button" onClick={() => show("move")} aria-label={`Reschedule ${row.name}'s class`} title="Reschedule" className={iconBtn}>
        <ArrowRightLeft aria-hidden className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => show("cancel")} aria-label={`Cancel ${row.name}'s class`} title="Cancel class" className={cn(iconBtn, "text-red-300 hover:text-red-200")}>
        <X aria-hidden className="h-4 w-4" />
      </button>
      <RescheduleDialog row={row} open={open === "move"} onClose={() => show(null)} notify={notify} onDone={done} />
      <CancelDialog row={row} open={open === "cancel"} onClose={() => show(null)} notify={notify} onDone={done} />
    </>
  );
}

/**
 * Everything a teacher does about one student in one class, from the Today row, in one small menu: Reschedule, Cancel, Message, a note,
 * the Discord steps, In person, and the next scale. Each opens a box right here; nothing sends you to the student's page.
 */
export function ClassRowMenu({ row, notifyPlace }: { row: ClassActionRow; notifyPlace: string }) {
  const router = useRouter();
  const [notify] = useNotifyStudent(notifyPlace);
  const [open, setOpen] = useState<"move" | "cancel" | "note" | "scale" | null>(null);
  const [inPerson, setInPerson] = useState(Boolean(row.inPerson));
  const [busy, setBusy] = useState(false);
  useEffect(() => setInPerson(Boolean(row.inPerson)), [row.inPerson]);

  const done = () => {
    setOpen(null);
    router.refresh();
  };
  const notOver = new Date(row.scheduledAt).getTime() + CLASS_MS > Date.now();
  const first = row.name.split(" ")[0];
  const item = buttonVariants({ variant: "secondary", size: "sm", className: "h-9 px-3" });

  async function toggleInPerson() {
    const next = !inPerson;
    setBusy(true);
    setInPerson(next);
    const result = await setClassInPersonAction(row.bookingId, next, notify).catch(() => ({ ok: false as const, error: "Something went wrong." }));
    setBusy(false);
    if (!result.ok) {
      setInPerson(!next);
      return void toast.error(result.error);
    }
    toast.success(next ? `${first}'s class is in person` : `${first}'s class is online`);
    router.refresh();
  }

  return (
    <>
      <ActionMenu label="More" align="right" icon={<EllipsisVertical aria-hidden className="h-4 w-4" />}>
        {row.active && (
          <button type="button" className={item} onClick={() => setOpen("move")}>
            <ArrowRightLeft aria-hidden className="h-4 w-4" />
            Reschedule
          </button>
        )}
        {row.active && (
          <button type="button" className={cn(item, "text-red-300")} onClick={() => setOpen("cancel")}>
            <X aria-hidden className="h-4 w-4" />
            Cancel class
          </button>
        )}
        <QuickMessageButton userId={row.studentId} name={first} />
        <button type="button" className={item} onClick={() => setOpen("note")}>
          <NotebookPen aria-hidden className="h-4 w-4" />
          Note
        </button>
        {row.active && notOver && (
          <button type="button" role="switch" aria-checked={inPerson} disabled={busy} className={item} onClick={() => void toggleInPerson()}>
            <MapPin aria-hidden className="h-4 w-4" />
            <span className="flex-1 text-left">In person</span>
            <SwitchLook on={inPerson} />
          </button>
        )}
        {row.nextScale && (
          <button type="button" className={item} onClick={() => setOpen("scale")}>
            <Sparkles aria-hidden className="h-4 w-4" />
            {row.nextScale.state === "READY" ? `Approve ${row.nextScale.code}` : `Next scale: ${row.nextScale.code}`}
          </button>
        )}
      </ActionMenu>
      <RescheduleDialog row={row} open={open === "move"} onClose={() => setOpen(null)} notify={notify} onDone={done} />
      <CancelDialog row={row} open={open === "cancel"} onClose={() => setOpen(null)} notify={notify} onDone={done} />
      {row.nextScale && (
        <ScaleReleaseDialog userId={row.studentId} name={row.name} scale={row.nextScale} open={open === "scale"} onClose={() => setOpen(null)} notify={notify} onDone={done} />
      )}
      <Dialog open={open === "note"} onOpenChange={(next) => !next && setOpen(null)} title={`Notes on ${row.name}`} description="Saved to their account. Hide one to keep it from the student.">
        {open === "note" && <StudentNotesEditor studentId={row.studentId} />}
      </Dialog>
    </>
  );
}

/** "Send Discord steps" next to "Not on Discord yet": emails the student how to connect (and puts it in their bell). Always sent. */
export function DiscordStepsButton({ studentId, name }: { studentId: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  async function send() {
    setBusy(true);
    const result = await notifyDiscordAction(studentId).catch(() => ({ ok: false, message: "Could not send." }));
    setBusy(false);
    if (!result.ok) return void toast.error(result.message);
    setSent(true);
    toast.success(`Discord steps for ${name.split(" ")[0]}: ${result.message}`);
  }
  if (sent) return <span className="text-small text-slate-400">Steps sent</span>;
  return (
    <button
      type="button"
      onClick={() => void send()}
      disabled={busy}
      className="tap inline-flex items-center gap-1 text-small font-medium text-signal-fg underline underline-offset-4 disabled:opacity-50"
    >
      <DiscordIcon size={14} />
      {busy ? "Sending…" : "Send Discord steps"}
    </button>
  );
}

const field =
  "w-full rounded-control bg-neu-base px-3.5 py-2.5 text-body text-slate-100 shadow-pressed-low outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-ring";

/**
 * "Message this class": one message to every student in a class, the same message Inbox > Messages sends (into each one's Mail, and by
 * email if chosen). Held 10 seconds with Undo, and sent once even on a double tap.
 */
export function ClassMessageButton({ studentIds, label }: { studentIds: string[]; label: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newIdempotencyKey());
  const count = studentIds.length;

  async function send() {
    if (!title.trim() || !body.trim()) return setError("Add a title and a message.");
    setBusy(true);
    setError(null);
    const hold = await toast.held(
      `Sending to ${count} ${count === 1 ? "student" : "students"}`,
      () => messageClassAction(studentIds, title.trim(), body.trim(), sendEmail, key.current).catch(() => ({ ok: false as const, error: "Something went wrong." })),
      { mail: sendEmail },
    );
    setBusy(false);
    if (hold.undone) return;
    const result = hold.value;
    if (!result.ok) return setError(result.error);
    key.current = newIdempotencyKey();
    toast.success(`Sent to ${result.summary.sent} ${result.summary.sent === 1 ? "student" : "students"}${result.summary.emailed > 0 ? ", and by email" : ""}`);
    setTitle("");
    setBody("");
    setOpen(false);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
        <MessageSquare aria-hidden className="h-4 w-4" />
        Message this class
      </button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return;
          setOpen(next);
          if (!next) setError(null);
        }}
        title={`Message the ${label} class`}
        description={`Goes to ${count} ${count === 1 ? "student" : "students"}, each in their own Mail.`}
        footer={
          <Button type="button" onClick={() => void send()} disabled={busy} loading={busy} className="w-full sm:w-auto">
            {busy ? "Sending…" : "Send"}
          </Button>
        }
      >
        <div className="space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title, e.g. Running 10 minutes late" aria-label="Title" className={field} maxLength={120} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message" aria-label="Message" rows={5} className={field} maxLength={4000} />
          <label className="flex cursor-pointer items-center gap-2.5 text-small text-slate-300">
            <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="h-4 w-4 accent-signal" />
            Also send it by email
          </label>
          {error && (
            <p role="alert" className="text-small text-red-400">
              {error}
            </p>
          )}
        </div>
      </Dialog>
    </>
  );
}

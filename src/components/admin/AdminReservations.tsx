"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Trash2 } from "@/components/ui/appIcons";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog } from "@/components/ui/Dialog";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { toast } from "@/components/ui/Toaster";
import { NotifyToggle, useNotifyStudent } from "@/components/admin/NotifyToggle";
import { reserveForCustomerAction, releaseReservationAction, getReservableHoursAction, bookReservationAction } from "@/app/(dashboard)/admin/schedule/actions";
import type { ReservableHour, ReservationGroup, ReservedHour } from "@/lib/ownerReservationsAdmin";
import { addCreditLabel, offDayQuestion } from "@/lib/adminBookingRules";
import { creditsLabelFromStored } from "@/lib/classCreditPricing";
import { newIdempotencyKey } from "@/lib/idempotencyClient";
import { Hint } from "@/components/ui/Hint";
import { StatusDot } from "@/components/ui/StatusDot";
import { Meta } from "@/components/ui/CardKit";

const field =
  "h-11 w-full min-w-0 rounded-control bg-neu-base px-4 text-body text-slate-100 shadow-pressed-low outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Keep a day, or some hours of it, for a customer so nobody can book it; and the list of what is being kept. A day the studio does not
 * usually teach can still be kept (after a yes) at a typed start time. A kept time whose customer has a verified account can be booked
 * for them right here ("Book it"). `initial` fills in the customer (from /admin/schedule?view=RESERVED&name=&email=&phone=).
 */
export function AdminReservations({
  hours,
  reservations,
  initial,
}: {
  hours: ReservableHour[];
  reservations: ReservationGroup[];
  initial?: { name?: string; email?: string; phone?: string };
}) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [whole, setWhole] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [sure, setSure] = useState<string | null>(null);
  // A day with no weekly times: the owner said yes to using it, and the start time typed for it.
  const [offDayOk, setOffDayOk] = useState(false);
  const [offTime, setOffTime] = useState("");
  const [booking, setBooking] = useState<ReservationGroup | null>(null);
  useEffect(() => {
    setOffDayOk(false);
    setOffTime("");
  }, [date]);
  // A new link (?name=&email=&phone=) while this view is already open fills the customer in again.
  useEffect(() => {
    if (initial?.name) setName(initial.name);
    if (initial?.email) setEmail(initial.email);
    if (initial?.phone) setPhone(initial.phone);
  }, [initial?.name, initial?.email, initial?.phone]);

  // The page's copy can be old (the browser keeps a visited page for a while), so a slot added a moment ago on the Times tab
  // could be missing. Asking the server again whenever a day is picked, or "Some hours" is chosen, always shows what is offered now.
  const [live, setLive] = useState<ReservableHour[] | null>(null);
  useEffect(() => {
    if (!date) return;
    let current = true;
    getReservableHoursAction()
      .then((fresh) => current && setLive(fresh))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [date, whole]);

  const dayHours = useMemo(() => {
    if (!date) return [];
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    return (live ?? hours).filter((h) => h.dayOfWeek === weekday);
  }, [date, hours, live]);
  const key = (h: ReservableHour) => `${h.scheduleId}:${h.chunkIndex}`;

  const offDay = Boolean(date && dayHours.length === 0);

  async function reserve(e: React.FormEvent) {
    e.preventDefault();
    if (!date) return toast.warning("Pick a day.");
    if (offDay && !offDayOk) return toast.warning(offDayQuestion(date));
    if (offDay && !offTime) return toast.warning("Type a start time.");
    setBusy(true);
    const hold = await toast.held(
      "Reserving for the customer",
      () =>
        reserveForCustomerAction({
          date,
          hours: offDay || whole ? null : dayHours.filter((h) => picked.has(key(h))).map((h) => ({ scheduleId: h.scheduleId, chunkIndex: h.chunkIndex })),
          ...(offDay ? { time: offTime } : {}),
          name,
          email,
          phone,
          note,
        }).catch(() => ({ ok: false as const, error: "Something went wrong. Try again." })),
      { mail: true },
    );
    setBusy(false);
    if (hold.undone) return;
    const result = hold.value;
    if (!result.ok) return toast.warning(result.error);
    if (result.emailed) toast.success(`Reserved. ${name.trim().split(/\s+/)[0] || "The customer"} was emailed.`);
    else toast.warning("Reserved, but the email could not be sent. Tell the customer yourself.");
    setDate("");
    setPicked(new Set());
    setName("");
    setEmail("");
    setPhone("");
    setNote("");
    router.refresh();
  }

  async function release(groupId: string) {
    if (sure !== groupId) {
      setSure(groupId);
      return;
    }
    setReleasing(groupId);
    const hold = await toast.held("Releasing the reservation", () =>
      releaseReservationAction(groupId).catch(() => ({ ok: false as const, error: "Something went wrong. Try again." })),
    );
    setReleasing(null);
    setSure(null);
    if (hold.undone) return;
    const result = hold.value;
    if (!result.ok) return toast.warning(result.error);
    toast.success("Released");
    router.refresh();
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <form onSubmit={reserve} className="space-y-4 rounded-2xl bg-neu-base p-5 shadow-raised-low">
        <h2 className="text-title font-semibold text-slate-50">Keep a day for a customer</h2>
        <p className="text-small text-slate-400">Students see these times as taken and cannot book them. Name, email and phone are needed. If a student already has a class in them, it is refused. For a day off, use Close a day instead.</p>
        <label className="block text-small text-slate-400">
          Day
          <input type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} className={`${field} mt-1.5`} />
        </label>

        {date && (
          <div>
            {offDay ? (
              offDayOk ? (
                <label className="block text-small text-slate-400">
                  Start time (Eastern)
                  <input
                    type="time"
                    step={300}
                    value={offTime}
                    onChange={(e) => setOffTime(e.target.value)}
                    className="mt-1.5 block h-11 w-40 rounded-control bg-neu-base px-4 text-body text-slate-100 shadow-pressed-low outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
              ) : (
                <div className="rounded-control bg-amber-300/10 p-4 ring-1 ring-inset ring-amber-300/20">
                  <p className="text-small text-slate-200">{offDayQuestion(date)}</p>
                  <button type="button" onClick={() => setOffDayOk(true)} className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-3" })}>
                    Yes, use it
                  </button>
                </div>
              )
            ) : (
              <>
                <div className="flex gap-2" role="group" aria-label="What to keep">
                  <button type="button" aria-pressed={whole} onClick={() => setWhole(true)} className={buttonVariants({ variant: "secondary", size: "sm", className: whole ? "shadow-pressed-low! text-signal-fg!" : "" })}>
                    Whole day
                  </button>
                  <button type="button" aria-pressed={!whole} onClick={() => setWhole(false)} className={buttonVariants({ variant: "secondary", size: "sm", className: !whole ? "shadow-pressed-low! text-signal-fg!" : "" })}>
                    Some hours
                  </button>
                </div>
                {!whole && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {dayHours.map((h) => {
                      const on = picked.has(key(h));
                      return (
                        <button
                          key={key(h)}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            setPicked((prev) => {
                              const next = new Set(prev);
                              if (on) next.delete(key(h));
                              else next.add(key(h));
                              return next;
                            })
                          }
                          className={`tap rounded-full px-3.5 py-1.5 text-small transition ${on ? "bg-signal text-slate-950" : "bg-slate-50/6 text-slate-300 hover:text-slate-50"}`}
                        >
                          {h.time}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <label className="block text-small text-slate-400">
          Customer name
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" className={`${field} mt-1.5`} placeholder="Full name" />
        </label>
        <label className="block text-small text-slate-400">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" className={`${field} mt-1.5`} placeholder="name@email.com" />
        </label>
        <label className="block text-small text-slate-400">
          Phone
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" className={`${field} mt-1.5`} placeholder="(555) 123-4567" />
        </label>
        <label className="block text-small text-slate-400">
          Note (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)} className={`${field} mt-1.5`} maxLength={200} />
        </label>

        <button type="submit" disabled={busy} aria-busy={busy} className={buttonVariants({ variant: "primary", className: "w-full sm:w-auto" })}>
          {busy ? <MorphingSquare size={14} className="mr-2 shrink-0" /> : <CalendarCheck aria-hidden className="mr-2 h-4 w-4" />}
          Reserve
        </button>
      </form>

      <section className="rounded-2xl bg-neu-base p-5 shadow-raised-low">
        <h2 className="flex items-baseline justify-between gap-3 text-title font-semibold text-slate-50">
          Kept for customers
          {reservations.length > 0 && <span className="text-small font-normal tabular-nums text-slate-500">{reservations.length}</span>}
        </h2>
        {reservations.length === 0 ? (
          <p className="mt-3 text-small text-slate-500">Nothing is reserved.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-50/8">
            {reservations.map((r) => {
              // Where the reservation stands, as one quiet status word (green only once the customer has booked), not an orange caps line.
              const state = r.booked
                ? { tone: "success" as const, text: "Booked by the customer" }
                : r.account === "verified"
                  ? { tone: "neutral" as const, text: "Reserved: the customer can book it" }
                  : r.account === "unverified"
                    ? { tone: "warning" as const, text: "Reserved: their email is not verified yet" }
                    : { tone: "neutral" as const, text: "Reserved: waiting for them to sign up" };
              return (
              <li key={r.groupId} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-body font-semibold text-slate-50">
                    {r.dayLabel} <span className="text-small font-normal text-slate-400">· {r.what}</span>
                  </p>
                  <p className="mt-0.5 break-words text-small text-slate-300">{r.name}</p>
                  <Meta className="break-words" items={[r.email, r.phone]} />
                  {r.note && <p className="mt-0.5 text-small text-slate-500">{r.note}</p>}
                  <StatusDot tone={state.tone} className="mt-1.5 text-slate-400">
                    {state.text}
                  </StatusDot>
                </div>
                {/* Book it is the one thing to do next; Release frees the time for anyone, so it is quiet red text that asks "Sure?" first. */}
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {r.accountId && !r.booked && r.hours.length > 0 && (
                    <button type="button" onClick={() => setBooking(r)} aria-haspopup="dialog" className={buttonVariants({ variant: "primary", size: "sm" })}>
                      <CalendarCheck aria-hidden className="mr-1.5 h-3.5 w-3.5" />
                      Book it
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void release(r.groupId)}
                    disabled={releasing === r.groupId}
                    aria-label={sure === r.groupId ? "Tap again to release" : `Release ${r.dayLabel}`}
                    className={buttonVariants({ variant: "ghost", size: "sm", className: "text-red-300 hover:text-red-200" })}
                  >
                    {releasing === r.groupId ? <MorphingSquare size={12} className="mr-1.5" /> : <Trash2 aria-hidden className="mr-1.5 h-3.5 w-3.5" />}
                    {sure === r.groupId ? "Sure?" : "Release"}
                  </button>
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </section>

      <BookReservedDialog group={booking} onClose={() => setBooking(null)} onBooked={() => router.refresh()} />
    </div>
  );
}

/**
 * "Book it": books the customer's own account into one hour kept for them (the same rules as any studio booking) and releases the
 * reservation. A whole day or several hours asks which one. No free credit? The owner adds it and books in one tap.
 */
function BookReservedDialog({ group, onClose, onBooked }: { group: ReservationGroup | null; onClose: () => void; onBooked: () => void }) {
  const [notify, setNotify] = useNotifyStudent("reserved-booking");
  const [hour, setHour] = useState<ReservedHour | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [short, setShort] = useState<{ shortBy: number; canAdd: boolean } | null>(null);
  const [key, setKey] = useState(() => newIdempotencyKey());
  const first = (group?.name ?? "").trim().split(/\s+/)[0] || "the customer";
  useEffect(() => {
    setHour(group && group.hours.length === 1 ? group.hours[0] : null);
    setError(null);
    setShort(null);
  }, [group]);

  async function book(addCredit = false) {
    if (!group || !hour) return;
    setBusy(true);
    setError(null);
    const result = await bookReservationAction(group.groupId, hour.scheduleId, hour.chunkIndex, { addCredit, key }, notify).catch(() => ({
      ok: false as const,
      error: "Something went wrong. Try again.",
      shortBy: undefined,
      canAddCredit: undefined,
    }));
    setBusy(false);
    if (!result.ok) {
      setShort(result.shortBy ? { shortBy: result.shortBy, canAdd: Boolean(result.canAddCredit) } : null);
      return setError(result.error);
    }
    toast.success(`${first} is booked.${result.creditsAdded > 0 ? ` ${creditsLabelFromStored(result.creditsAdded)} added.` : ""}`);
    setKey(newIdempotencyKey());
    onClose();
    onBooked();
  }

  return (
    <Dialog
      open={group !== null}
      onOpenChange={(open) => !open && !busy && onClose()}
      title={`Book ${first} into their time`}
      description={group ? `${group.dayLabel}. The reservation is released once the class is booked. It uses one class credit.` : undefined}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Never mind
          </Button>
          {short?.canAdd ? (
            <Button type="button" disabled={busy || !hour} loading={busy} onClick={() => void book(true)}>
              {addCreditLabel(short.shortBy)}
            </Button>
          ) : (
            <Button type="button" disabled={busy || !hour} loading={busy} onClick={() => void book()}>
              {hour ? `Book ${hour.time}` : "Pick a time"}
            </Button>
          )}
        </div>
      }
    >
      <NotifyToggle on={notify} onChange={setNotify} label={`Notify ${first}`} className="mb-3" />
      {group && group.hours.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Which hour">
          {group.hours.map((h) => {
            const on = hour?.scheduleId === h.scheduleId && hour.chunkIndex === h.chunkIndex;
            return (
              <button
                key={`${h.scheduleId}:${h.chunkIndex}`}
                type="button"
                data-no-lens=""
                aria-pressed={on}
                onClick={() => {
                  setHour(h);
                  setShort(null);
                  setError(null);
                }}
                className={`tap rounded-full px-3.5 py-1.5 text-small transition ${on ? "bg-signal text-slate-950" : "bg-slate-50/6 text-slate-300 hover:text-slate-50"}`}
              >
                {h.time}
              </button>
            );
          })}
        </div>
      )}
      {group && group.hours.length === 1 && <p className="text-small text-slate-300">{group.hours[0].time}</p>}
      {error && <p role="alert" className="mt-3 text-small text-red-400">{error}</p>}
    </Dialog>
  );
}

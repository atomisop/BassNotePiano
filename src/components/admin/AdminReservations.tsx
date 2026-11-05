"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Trash2 } from "@/components/ui/appIcons";
import { buttonVariants } from "@/components/ui/button";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { toast } from "@/components/ui/Toaster";
import { reserveForCustomerAction, releaseReservationAction, getReservableHoursAction } from "@/app/(dashboard)/admin/schedule/actions";
import type { ReservableHour, ReservationGroup } from "@/lib/ownerReservationsAdmin";

const field =
  "h-11 w-full min-w-0 rounded-control bg-neu-base px-4 text-body text-slate-100 shadow-pressed-low outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-ring";

/** Keep a day, or some hours of it, for a customer so nobody can book it; and the list of what is being kept. */
export function AdminReservations({ hours, reservations }: { hours: ReservableHour[]; reservations: ReservationGroup[] }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [whole, setWhole] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [sure, setSure] = useState<string | null>(null);

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

  async function reserve(e: React.FormEvent) {
    e.preventDefault();
    if (!date) return toast.warning("Pick a day.");
    if (dayHours.length === 0) return toast.warning("There are no classes that day.");
    setBusy(true);
    const result = await reserveForCustomerAction({
      date,
      hours: whole ? null : dayHours.filter((h) => picked.has(key(h))).map((h) => ({ scheduleId: h.scheduleId, chunkIndex: h.chunkIndex })),
      name,
      email,
      phone,
      note,
    }).catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));
    setBusy(false);
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
    const result = await releaseReservationAction(groupId).catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));
    setReleasing(null);
    setSure(null);
    if (!result.ok) return toast.warning(result.error);
    toast.success("Released");
    router.refresh();
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <form onSubmit={reserve} className="space-y-4 rounded-2xl bg-neu-base p-5 shadow-raised-low">
        <h2 className="text-title font-semibold text-slate-50">Keep a day for a customer</h2>
        <label className="block text-small text-slate-400">
          Day
          <input type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} className={`${field} mt-1.5`} />
        </label>

        {date && (
          <div>
            {dayHours.length === 0 ? (
              <p className="text-small text-slate-500">There are no classes that day.</p>
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
        <h2 className="text-title font-semibold text-slate-50">Kept for customers</h2>
        {reservations.length === 0 ? (
          <p className="mt-3 text-small text-slate-500">Nothing is reserved.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-50/10">
            {reservations.map((r) => (
              <li key={r.groupId} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-small font-medium text-slate-100">
                    {r.dayLabel} <span className="font-normal text-slate-400">· {r.what}</span>
                  </p>
                  <p className="mt-0.5 text-caption uppercase tracking-wide text-signal-fg">
                    {r.booked
                      ? "Booked by the customer"
                      : r.account === "verified"
                        ? "Reserved: the customer can book it"
                        : r.account === "unverified"
                          ? "Reserved: their email is not verified yet"
                          : "Reserved: waiting for them to sign up"}
                  </p>
                  <p className="mt-1 break-words text-small text-slate-300">{r.name}</p>
                  <p className="break-words text-small text-slate-500">
                    {r.email} · {r.phone}
                  </p>
                  {r.note && <p className="mt-0.5 text-small text-slate-500">{r.note}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => void release(r.groupId)}
                  disabled={releasing === r.groupId}
                  aria-label={sure === r.groupId ? "Tap again to release" : `Release ${r.dayLabel}`}
                  className={buttonVariants({ variant: "secondary", size: "sm", className: "shrink-0" })}
                >
                  {releasing === r.groupId ? <MorphingSquare size={12} className="mr-1.5" /> : <Trash2 aria-hidden className="mr-1.5 h-3.5 w-3.5" />}
                  {sure === r.groupId ? "Sure?" : "Release"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

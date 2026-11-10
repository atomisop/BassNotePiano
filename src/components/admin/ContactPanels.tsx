"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageBack } from "@/components/ui/BackLink";
import { Button, buttonVariants } from "@/components/ui/button";
import { Mail, MessageSquare, Phone } from "@/components/ui/appIcons";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/Card";
import { INSTRUMENT_LABEL, SKILL_LABEL } from "@/lib/classRegistrationLabels";
import type { ContactInput, HoldChoice } from "@/lib/contacts";
import { toast } from "@/components/ui/Toaster";
import { Hint } from "@/components/ui/Hint";
import { Fact, Facts, Meta } from "@/components/ui/CardKit";

const STATUS_LABEL: Record<string, string> = { INTERESTED: "Interested", TRIAL: "Trial", ACTIVE: "Active", PAUSED: "Paused" };
const selectClass =
  "flex h-10 w-full rounded-control border border-(--neu-edge) bg-neu-base px-3 text-body text-slate-50 shadow-pressed-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Result = { ok: true } | { ok: false; error: string };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-small font-medium text-slate-300">{label}</span>
      {children}
    </label>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? <p role="alert" className="text-small text-red-400">{error}</p> : null;
}

/** Add or edit one contact. `onSave` returns the new id when adding, so the page can open it. */
export function ContactForm({
  initial,
  submitLabel,
  onSave,
  openAfterSave = false,
}: {
  initial?: Partial<ContactInput>;
  submitLabel: string;
  onSave: (input: ContactInput) => Promise<({ ok: true } & { id?: string }) | { ok: false; error: string }>;
  openAfterSave?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function submit(form: FormData) {
    const get = (key: string) => String(form.get(key) ?? "");
    setError(null);
    setSaved(false);
    start(async () => {
      const result = await onSave({
        name: get("name"),
        phone: get("phone"),
        email: get("email"),
        instrument: get("instrument"),
        skillLevel: get("skillLevel"),
        source: get("source"),
        notes: get("notes"),
        status: get("status"),
      });
      if (!result.ok) return setError(result.error);
      setSaved(true);
      if (openAfterSave && result.id) router.push(`/admin/contacts/${result.id}`);
      else router.refresh();
    });
  }

  return (
    <form action={submit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input name="name" defaultValue={initial?.name ?? ""} required maxLength={120} autoComplete="off" />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={initial?.status ?? "INTERESTED"} className={selectClass}>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </Field>
        <Field label="Phone">
          <Input name="phone" defaultValue={initial?.phone ?? ""} maxLength={40} inputMode="tel" autoComplete="off" />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" defaultValue={initial?.email ?? ""} maxLength={200} autoComplete="off" />
        </Field>
        <Field label="Instrument">
          <select name="instrument" defaultValue={initial?.instrument ?? ""} className={selectClass}>
            <option value="">Not set</option>
            {Object.entries(INSTRUMENT_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </Field>
        <Field label="Level">
          <select name="skillLevel" defaultValue={initial?.skillLevel ?? ""} className={selectClass}>
            <option value="">Not set</option>
            {Object.entries(SKILL_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Where they came from">
        <Input name="source" defaultValue={initial?.source ?? ""} maxLength={120} placeholder="Friend of a student, walked in, flyer" autoComplete="off" />
      </Field>
      <Field label="Notes">
        <textarea
          name="notes"
          defaultValue={initial?.notes ?? ""}
          maxLength={4000}
          rows={4}
          className="w-full rounded-control border border-(--neu-edge) bg-neu-base px-3 py-2 text-body text-slate-50 shadow-pressed-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </Field>
      <ErrorLine error={error} />
      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>{submitLabel}</Button>
        {saved && !openAfterSave && <span className="text-small text-slate-400">Saved</span>}
      </div>
    </form>
  );
}

export interface HoldRow {
  id: string;
  label: string;
  until: string | null;
  note: string | null;
  releasedAt: string | null;
}

/** The weekly times being kept for this contact: add one, release one. Holds only warn when booking; they never block. */
export function ContactHolds({
  contactId,
  holds,
  choices,
  onAdd,
  onRelease,
}: {
  contactId: string;
  holds: HoldRow[];
  choices: HoldChoice[];
  onAdd: (contactId: string, scheduleId: string, chunkIndex: number, until: string | null, note: string | null) => Promise<Result>;
  onRelease: (holdId: string) => Promise<Result>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const active = holds.filter((hold) => !hold.releasedAt);
  const past = holds.filter((hold) => hold.releasedAt);

  function add(form: FormData) {
    const [scheduleId, chunk] = String(form.get("slot") ?? "").split(":");
    setError(null);
    start(async () => {
      const result = await onAdd(contactId, scheduleId, Number(chunk), String(form.get("until") ?? "") || null, String(form.get("note") ?? "") || null);
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  }

  function release(id: string) {
    setError(null);
    start(async () => {
      const result = await onRelease(id);
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  }

  return (
    <Card>
      <h2 className="text-title font-semibold text-slate-50">Reserved times<Hint className="ml-1.5">A reminder only. When you book someone into one of these times from Schedule, you are asked first. Nothing is blocked.</Hint></h2>
      {/* Each kept time is a row: the day and time bright, how long and why quiet, Release a quiet text button. */}
      <ul className="mt-3 divide-y divide-slate-50/6">
        {active.length === 0 && <li className="py-2.5 text-small text-slate-500">No reserved times.</li>}
        {active.map((hold) => (
          <li key={hold.id} className="flex min-h-12 items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="text-body font-medium text-slate-50">{hold.label}</p>
              <Meta items={[hold.until ? `Until ${hold.until}` : "Until released", hold.note]} />
            </div>
            <Button type="button" size="sm" variant="ghost" className="shrink-0" onClick={() => release(hold.id)} disabled={pending}>Release</Button>
          </li>
        ))}
      </ul>
      {past.length > 0 && (
        <p className="mt-2 text-small text-slate-500">{past.length} released earlier: {past.map((hold) => hold.label).join(", ")}</p>
      )}
      <form action={add} className="mt-5 grid gap-3 border-t border-(--neu-edge) pt-4">
        <Field label="Weekly time">
          <select name="slot" required defaultValue="" className={selectClass}>
            <option value="" disabled>Choose a day and time</option>
            {choices.map((choice) => (
              <option key={`${choice.scheduleId}:${choice.chunkIndex}`} value={`${choice.scheduleId}:${choice.chunkIndex}`}>{choice.label}</option>
            ))}
          </select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Keep it until (optional)">
            <Input name="until" type="date" />
          </Field>
          <Field label="Note (optional)">
            <Input name="note" maxLength={300} autoComplete="off" />
          </Field>
        </div>
        <ErrorLine error={error} />
        <div>
          <Button type="submit" size="sm" loading={pending}>Reserve this time</Button>
        </div>
      </form>
    </Card>
  );
}

export interface SessionRow {
  id: string;
  day: string;
  attended: boolean;
  note: string | null;
}

/** The days this contact took a class. */
export function ContactSessions({
  contactId,
  sessions,
  onAdd,
  onDelete,
}: {
  contactId: string;
  sessions: SessionRow[];
  onAdd: (contactId: string, day: string, attended: boolean, note: string | null) => Promise<Result>;
  onDelete: (sessionId: string) => Promise<Result>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function add(form: FormData) {
    setError(null);
    start(async () => {
      const result = await onAdd(contactId, String(form.get("day") ?? ""), form.get("absent") !== "on", String(form.get("note") ?? "") || null);
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  }

  function remove(id: string) {
    start(async () => {
      const hold = await toast.held("Deleting the class entry", () => onDelete(id));
      if (hold.undone) return;
      const result = hold.value;
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  }

  const attended = sessions.filter((s) => s.attended).length;

  return (
    <Card>
      <h2 className="text-title font-semibold text-slate-50">Classes taken</h2>
      {/* The count is the point of the card, so it leads; a miss is amber. */}
      {sessions.length === 0 ? (
        <p className="mt-1 text-small text-slate-400">None logged yet.</p>
      ) : (
        <Facts columns={2} className="mt-3">
          <Fact label="Attended" value={attended} />
          <Fact label="Missed" value={sessions.length - attended} tone={sessions.length - attended > 0 ? "warning" : "muted"} />
        </Facts>
      )}
      {sessions.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-50/6 border-t border-slate-50/8">
          {sessions.map((session) => (
            <li key={session.id} className="flex min-h-12 items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className={`text-body font-medium tabular-nums ${session.attended ? "text-slate-50" : "text-slate-400"}`}>
                  {session.day}
                  {session.attended ? "" : <span className="text-amber-300"> (missed)</span>}
                </p>
                {session.note && <p className="truncate text-small text-slate-500">{session.note}</p>}
              </div>
              <Button type="button" size="sm" variant="ghost" className="shrink-0 text-red-300 hover:text-red-200" onClick={() => remove(session.id)} disabled={pending} aria-label={`Remove ${session.day}`}>Remove</Button>
            </li>
          ))}
        </ul>
      )}
      <form action={add} className="mt-5 grid gap-3 border-t border-(--neu-edge) pt-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Day">
            <Input name="day" type="date" required />
          </Field>
          <Field label="Note (optional)">
            <Input name="note" maxLength={300} autoComplete="off" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-small text-slate-300">
          <input type="checkbox" name="absent" className="h-4 w-4" /> They did not come
        </label>
        <ErrorLine error={error} />
        <div>
          <Button type="submit" size="sm" loading={pending}>Log this day</Button>
        </div>
      </form>
    </Card>
  );
}

/**
 * One person who sent the public class form (there is no review step): what they typed and one tap to call, text or email them
 * outside the app. Remove takes the entry off the list, with a few seconds to undo.
 */
export function ClassFormEntry({
  id,
  name,
  email,
  phone,
  instrument,
  level,
  notes,
  sent,
  onRemove,
}: {
  id: string;
  name: string;
  email: string;
  phone: string;
  instrument: string;
  level: string;
  notes: string | null;
  sent: string;
  onRemove: (registrationId: string) => Promise<Result>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const dial = phone.replace(/[^\d+]/g, "");
  const action = buttonVariants({ variant: "secondary", size: "sm", className: "tap gap-1.5" });

  function remove() {
    setError(null);
    start(async () => {
      const hold = await toast.held(`Removing ${name}`, () => onRemove(id));
      if (hold.undone) return;
      const result = hold.value;
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  }

  return (
    <div className="rounded-card bg-neu-base px-4 py-3 shadow-raised-low">
      <p className="flex items-center gap-2">
        <span className="truncate text-body font-semibold text-slate-50">{name}</span>
        <span className="shrink-0 rounded-full bg-slate-700/40 px-2 py-0.5 text-small font-medium text-slate-200">Class form</span>
      </p>
      <p className="text-small text-slate-400">
        {instrument} · {level} · <span className="whitespace-nowrap">sent {sent}</span>
      </p>
      <p className="mt-2 break-words text-small text-slate-300">
        {phone} · {email}
      </p>
      {notes && <p className="mt-1 whitespace-pre-line break-words text-small text-slate-400">&ldquo;{notes}&rdquo;</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={`tel:${dial}`} className={action}>
          <Phone className="h-4 w-4" aria-hidden /> Call
        </a>
        <a href={`sms:${dial}`} className={action}>
          <MessageSquare className="h-4 w-4" aria-hidden /> Text
        </a>
        <a href={`mailto:${email}?subject=${encodeURIComponent("Your Bass Note Piano classes")}`} className={action}>
          <Mail className="h-4 w-4" aria-hidden /> Email
        </a>
        <Button type="button" size="sm" variant="ghost" className="tap ml-auto" onClick={remove} disabled={pending} aria-label={`Remove ${name}`}>
          Remove
        </Button>
      </div>
      <ErrorLine error={error} />
    </div>
  );
}

export function BackToContacts() {
  return (
    <PageBack href="/admin/contacts" />
  );
}

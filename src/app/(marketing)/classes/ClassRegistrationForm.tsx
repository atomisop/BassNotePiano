"use client";

import { useState, type FormEvent } from "react";
import type { PrimaryInstrument, SkillLevel } from "@prisma/client";
import { submitClassRegistrationAction } from "./actions";

const INSTRUMENTS: { value: PrimaryInstrument; label: string }[] = [
  { value: "PIANO_KEYBOARD", label: "Piano / Keyboard" },
  { value: "BASS", label: "Bass" },
  { value: "GUITAR", label: "Guitar" },
  { value: "DRUMS", label: "Drums" },
  { value: "VOCAL", label: "Vocal" },
  { value: "OTHER", label: "Other" },
];

const SKILL_LEVELS: { value: SkillLevel; label: string }[] = [
  { value: "BEGINNER", label: "Beginner" },
  { value: "INTERMEDIATE", label: "Intermediate" },
  { value: "ADVANCED", label: "Advanced" },
];

function Pill({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    // aria-pressed carries the selection. Without it the only thing marking
    // the chosen instrument is a colour change, which is invisible to a screen
    // reader and to anyone who can't distinguish the two border tints.
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--c-a-400)/0.7)] ${
        selected
          ? "border-[rgb(var(--c-a-400)/0.6)] bg-[rgb(var(--c-a-400)/0.1)] text-[rgb(var(--c-a-200))]"
          : "border-ink/10 bg-slate-950 text-slate-400 hover:border-ink/15"
      }`}
    >
      {label}
    </button>
  );
}

function fieldClass() {
  return "w-full glass-surface-subtle px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-[rgb(var(--c-a-400)/0.6)]";
}

export function ClassRegistrationForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [instrument, setInstrument] = useState<PrimaryInstrument | null>(null);
  const [skillLevel, setSkillLevel] = useState<SkillLevel | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!instrument || !skillLevel) {
      setError("Choose an instrument and skill level.");
      return;
    }

    setSubmitting(true);
    const result = await submitClassRegistrationAction({ fullName, email, phone, instrument, skillLevel, notes });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(true);
  }

  if (success) {
    return (
      <div className="glass-surface-elevated p-8 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-a-400)/0.8)]">Request received</p>
        <h3 className="mt-2 font-serif text-xl text-slate-50">Thanks, {fullName.split(" ")[0]}.</h3>
        <p className="mt-2 text-sm text-slate-400">
          We&apos;ve got your registration for {INSTRUMENTS.find((i) => i.value === instrument)?.label.toLowerCase()} lessons.
          We&apos;ll reach out at {email} or {phone} shortly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="glass-surface-elevated space-y-5 p-6 sm:p-8">
      {/* Every label is tied to its field with htmlFor/id.
          These labels used to be plain siblings with no association, which
          looks identical on screen but leaves a screen reader announcing four
          unlabelled fields — the placeholder is not a substitute, since it
          disappears the moment you start typing. It also means tapping the
          label now focuses the field, which is the behaviour people expect on
          a phone where the targets are small. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="reg-full-name" className="mb-1.5 block text-xs font-medium text-slate-400">
            Full name
          </label>
          <input
            id="reg-full-name"
            name="fullName"
            type="text"
            required
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="First name Last name"
            className={fieldClass()}
          />
        </div>
        <div>
          <label htmlFor="reg-email" className="mb-1.5 block text-xs font-medium text-slate-400">
            Email
          </label>
          <input
            id="reg-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={fieldClass()}
          />
        </div>
      </div>

      <div>
        <label htmlFor="reg-phone" className="mb-1.5 block text-xs font-medium text-slate-400">
          Phone number
        </label>
        <input
          id="reg-phone"
          name="phone"
          type="tel"
          required
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(555) 123-4567"
          className={fieldClass()}
        />
      </div>

      {/* These two are single-select sets of buttons, not free text, so the
          heading above them can't be a <label> (there is no one field to point
          at). role="group" + aria-labelledby is the equivalent: it tells a
          screen reader that these pills belong together and what the set is
          asking, instead of reading six unrelated buttons in a row. */}
      <div role="group" aria-labelledby="reg-instrument-label">
        <p id="reg-instrument-label" className="mb-1.5 text-xs font-medium text-slate-400">
          Instrument you want to learn
        </p>
        <div className="flex flex-wrap gap-2">
          {INSTRUMENTS.map((opt) => (
            <Pill key={opt.value} label={opt.label} selected={instrument === opt.value} onClick={() => setInstrument(opt.value)} />
          ))}
        </div>
      </div>

      <div role="group" aria-labelledby="reg-skill-label">
        <p id="reg-skill-label" className="mb-1.5 text-xs font-medium text-slate-400">
          Current skill level
        </p>
        <div className="flex flex-wrap gap-2">
          {SKILL_LEVELS.map((opt) => (
            <Pill key={opt.value} label={opt.label} selected={skillLevel === opt.value} onClick={() => setSkillLevel(opt.value)} />
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="reg-notes" className="mb-1.5 block text-xs font-medium text-slate-400">
          Anything else we should know? (optional)
        </label>
        <textarea
          id="reg-notes"
          name="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Availability, goals, prior experience…"
          className={`${fieldClass()} resize-none`}
        />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="cta-sheen cta-fill w-full rounded-xl py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Submitting…" : "Request to register"}
      </button>
    </form>
  );
}

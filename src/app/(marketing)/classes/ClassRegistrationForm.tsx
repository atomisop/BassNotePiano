"use client";

import { TurnstileWidget } from "@/components/security/TurnstileWidget";
import { EmailTypoHint } from "@/components/auth/EmailTypoHint";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { PrimaryInstrument, SkillLevel } from "@prisma/client";
import { INSTRUMENTS_COMING_SOON } from "@/lib/classRegistrationLabels";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { PianoCat } from "@/components/layout/PianoCat";
import { submitClassRegistrationAction } from "./actions";
import { buttonVariants } from "@/components/ui/button";

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

function Pill({
  label,
  selected,
  onClick,
  comingSoon,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  comingSoon?: boolean;
}) {
  return (
    // aria-pressed carries the selection. Without it the only thing marking
    // the chosen instrument is a colour change, which is invisible to a screen
    // reader and to anyone who can't distinguish the two border tints.
    //
    // disabled when comingSoon: this used to stay clickable on purpose, to
    // register early interest in Drums/Vocal ahead of launch, but a "Coming
    // soon" tag on something you can still click and select reads as a bug,
    // not a feature. Disabled per direct instruction.
    <button
      type="button"
      onClick={onClick}
      disabled={comingSoon}
      aria-pressed={selected}
      className={`tap flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-small font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-50/70 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-ink/10 ${
        selected
          ? "border-slate-50/60 bg-slate-50/10 text-slate-50"
          : "border-ink/10 bg-slate-950 text-slate-400 hover:border-ink/15"
      } ${comingSoon ? "" : "cursor-pointer"}`}
    >
      {label}
      {comingSoon && (
        // A plain fact, so a quiet word and not a chip inside a chip (DESIGN.md, Hierarchy rule 10); the same as onboarding.
        <span className="whitespace-nowrap text-caption text-slate-400">Coming soon</span>
      )}
    </button>
  );
}

function fieldClass() {
  // placeholder:text-slate-500, not -600: -600 resolves to rgb(120,120,120)
  // on this surface's rgb(26,26,26) ground, about 3.9:1, well under the
  // 4.5:1 AA minimum for text (marketing.css documents this exact pairing
  // as "non-text, always"). -500 (6.5:1) is the same token SiteFooter's
  // real body text already uses after the accessibility pass found the
  // same mistake there.
  return "w-full glass-surface-subtle border-(--field-edge) px-3 py-2.5 text-body text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-slate-50/60";
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
  // Honeypot, see submitClassRegistrationAction. Real visitors never see or fill it.
  const [website, setWebsite] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);
  // The long form shrinks to a short card on success, which can leave it under the top bar: bring it into view.
  const thanksRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (success) thanksRef.current?.scrollIntoView({ block: "center" });
  }, [success]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!instrument || !skillLevel) {
      setError("Choose an instrument and skill level.");
      return;
    }

    setSubmitting(true);
    const result = await submitClassRegistrationAction({ fullName, email, phone, instrument, skillLevel, notes, website, turnstileToken });
    setSubmitting(false);

    if (!result.ok) {
      setCaptchaReset((n) => n + 1);
      setError(result.error);
      return;
    }
    setSuccess(true);
  }

  if (success) {
    // No review step anymore: the details go straight to the teacher, who gets in touch outside the app. The cat is the
    // pull-to-refresh mascot (PianoCat), smiling.
    return (
      <div ref={thanksRef} role="status" className="glass-surface-elevated flex flex-col items-center p-8 text-center">
        <PianoCat size={88} smile />
        <h2 className="mt-4 font-serif text-title text-slate-50">Thanks, {fullName.split(" ")[0]}!</h2>
        <p className="mt-2 text-body text-slate-300">An instructor will reach out to you soon, by email or phone, to set up your first class.</p>
        <p className="mt-1 text-small text-slate-400">
          We&apos;ll contact you at {email} or {phone}.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="glass-surface-elevated relative space-y-6 p-6 sm:p-8">
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="cls-hp">Leave this empty</label>
        <input id="cls-hp" name="bn_trap_x7" type="text" tabIndex={-1} autoComplete="off" data-lpignore="true" data-1p-ignore data-form-type="other" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      {/* Every label is tied to its field with htmlFor/id.
          These labels used to be plain siblings with no association, which
          looks identical on screen but leaves a screen reader announcing four
          unlabelled fields, the placeholder is not a substitute, since it
          disappears the moment you start typing. It also means tapping the
          label now focuses the field, which is the behaviour people expect on
          a phone where the targets are small. */}
      {/* Two short groups instead of one long form: how to reach you, then what you want to learn. */}
      {/* Each group's legend is the one heading inside it; the field labels under it stay small and muted, and the space
          between the groups is bigger than the space inside one. */}
      <fieldset className="space-y-4">
        <legend className="mb-3 text-body font-semibold text-slate-50">How to reach you</legend>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="reg-full-name" className="mb-1.5 block text-small font-medium text-slate-400">
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
          <label htmlFor="reg-email" className="mb-1.5 block text-small font-medium text-slate-400">
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
            spellCheck={false}
            className={fieldClass()}
          />
          <EmailTypoHint value={email} onFix={setEmail} />
        </div>
      </div>

      <div>
        <label htmlFor="reg-phone" className="mb-1.5 block text-small font-medium text-slate-400">
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

      </fieldset>

      <fieldset className="space-y-4 border-t border-(--neu-edge) pt-6">
        <legend className="float-left mb-3 w-full text-body font-semibold text-slate-50">What you want to learn</legend>
      {/* These two are single-select sets of buttons, not free text, so the
          heading above them can't be a <label> (there is no one field to point
          at). role="group" + aria-labelledby is the equivalent: it tells a
          screen reader that these pills belong together and what the set is
          asking, instead of reading six unrelated buttons in a row. */}
      <div role="group" aria-labelledby="reg-instrument-label">
        <p id="reg-instrument-label" className="mb-1.5 text-small font-medium text-slate-400">
          Instrument
        </p>
        {/* An even grid on phones (two equal columns, an odd last one across both), the loose row from sm up. */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap max-sm:[&>button:last-child:nth-child(odd)]:col-span-2 max-sm:[&>button]:justify-center">
          {INSTRUMENTS.map((opt) => (
            <Pill
              key={opt.value}
              label={opt.label}
              selected={instrument === opt.value}
              onClick={() => setInstrument(opt.value)}
              comingSoon={INSTRUMENTS_COMING_SOON.has(opt.value)}
            />
          ))}
        </div>
      </div>

      <div role="group" aria-labelledby="reg-skill-label">
        <p id="reg-skill-label" className="mb-1.5 text-small font-medium text-slate-400">
          Skill level
        </p>
        <div className="flex flex-wrap gap-2">
          {SKILL_LEVELS.map((opt) => (
            <Pill key={opt.value} label={opt.label} selected={skillLevel === opt.value} onClick={() => setSkillLevel(opt.value)} />
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="reg-notes" className="mb-1.5 block text-small font-medium text-slate-400">
          Anything else we should know? <span className="font-normal text-slate-500">(optional)</span>
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

      </fieldset>

      <TurnstileWidget action="class_form" onToken={setTurnstileToken} resetKey={captchaReset} />

      {error && <p className="text-small text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className={buttonVariants({ variant: "primary", className: "flex w-full" })}
      >
        {submitting && <MorphingSquare size={14} className="mr-2 shrink-0" />}
        {submitting ? "Sending…" : "Send my details"}
      </button>

      {/* No account is created by this form (see ClassRegistration's own
          schema comment), so there's no consent checkbox to gate submission
          on the way /register does. This is a plain disclosure line, not a
          click-through, since a name/email/phone lead-capture form is still
          collecting real personal data from a visitor with nothing else on
          this page pointing them at how it's handled. */}
      <p className="text-center text-small text-slate-500">
        By submitting, you agree to our{" "}
        <Link href="/privacy" target="_blank" className="text-slate-300 underline underline-offset-4 transition hover:text-slate-50">
          Privacy policy
        </Link>
        .
      </p>
    </form>
  );
}

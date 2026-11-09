"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PrimaryInstrument, SkillLevel } from "@prisma/client";
import { ArrowRight, Send } from "@/components/ui/appIcons";
import { Dialog } from "@/components/ui/Dialog";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/Toaster";
import { announceChange } from "@/lib/liveEvents";
import { INSTRUMENT_LABEL, INSTRUMENTS_COMING_SOON, SKILL_LABEL } from "@/lib/classRegistrationLabels";
import { askForTrialClassAction } from "@/app/(dashboard)/dashboard/actions";
import type { TrialApplyFacts } from "@/lib/trialApplication";

const INSTRUMENTS = Object.keys(INSTRUMENT_LABEL) as PrimaryInstrument[];
const LEVELS = Object.keys(SKILL_LABEL) as SkillLevel[];
const NOTE_MAX = 1000;

const chip = (selected: boolean) =>
  `tap inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-small font-medium ring-1 ring-inset transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
    selected ? "bg-slate-50/12 text-slate-50 ring-slate-50/50" : "bg-neu-base text-slate-400 ring-slate-50/10 hover:text-slate-200"
  }`;
const field =
  "w-full rounded-control bg-neu-base px-4 py-2.5 text-body text-slate-100 shadow-pressed-low outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Home's "Ask for a free trial class" for a signed-in new student. The request goes from the account (its name, email and phone), so
 * approving it starts the trial on this very account; only what the account is missing (instrument, level, a phone number) is asked here,
 * plus an optional note. No second form, no captcha, nothing to type twice.
 */
export function TrialApplyButton({ label, facts }: { label: string; facts: TrialApplyFacts }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [instrument, setInstrument] = useState<PrimaryInstrument | null>(facts.instrument);
  const [skill, setSkill] = useState<SkillLevel | null>(facts.skillLevel);
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = Boolean(instrument && skill && (facts.hasPhone || phone.trim().length >= 7));

  async function send() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const result = await askForTrialClassAction({
      instrument: instrument ?? undefined,
      skillLevel: skill ?? undefined,
      phone: facts.hasPhone ? undefined : phone,
      note,
    }).catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setOpen(false);
    toast.success("Request sent", { description: "We will be in touch soon. Your first lessons open when it is approved." });
    announceChange("notifications");
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonVariants({ size: "lg" })}>
        {label}
        <ArrowRight aria-hidden className="h-4 w-4" />
      </button>
      <Dialog
        open={open}
        onOpenChange={(next) => !busy && setOpen(next)}
        title="Ask for a free trial class"
        description="We send it from your account, so there is nothing else to fill in. The studio will be in touch to set up your class."
        footer={
          <button type="button" disabled={!ready || busy} onClick={() => void send()} className={buttonVariants({ size: "lg", className: "w-full sm:w-auto" })}>
            {busy ? <MorphingSquare size={14} className="shrink-0" /> : <Send aria-hidden className="h-4 w-4" />}
            Send my request
          </button>
        }
      >
        <div className="space-y-5">
          {!facts.instrument && (
            <fieldset>
              <legend className="text-small font-medium text-slate-300">What would you like to learn?</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {INSTRUMENTS.map((value) => {
                  const soon = INSTRUMENTS_COMING_SOON.has(value);
                  return (
                    <button key={value} type="button" disabled={soon} aria-pressed={instrument === value} onClick={() => setInstrument(value)} className={chip(instrument === value)}>
                      {INSTRUMENT_LABEL[value]}
                      {soon && <span className="text-caption text-slate-500">Soon</span>}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
          {!facts.skillLevel && (
            <fieldset>
              <legend className="text-small font-medium text-slate-300">Your level</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {LEVELS.map((value) => (
                  <button key={value} type="button" aria-pressed={skill === value} onClick={() => setSkill(value)} className={chip(skill === value)}>
                    {SKILL_LABEL[value]}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {!facts.hasPhone && (
            <label className="block">
              <span className="text-small font-medium text-slate-300">Your phone number</span>
              <input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="So the studio can reach you" className={`mt-2 ${field}`} />
              <span className="mt-1 block text-small text-slate-500">It is saved to your account.</span>
            </label>
          )}
          <label className="block">
            <span className="text-small font-medium text-slate-300">A note for the teacher (optional)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))} rows={3} placeholder="Times that suit you, what you would like to play" className={`mt-2 resize-none ${field}`} />
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

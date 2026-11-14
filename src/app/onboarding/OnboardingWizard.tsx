"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import type { LearningGoal, PrimaryInstrument, SkillLevel } from "@prisma/client";
import { INSTRUMENTS_COMING_SOON } from "@/lib/classRegistrationLabels";
import { INSTRUMENT_INTENT_KEY, parseInstrumentIntent } from "@/lib/instrumentIntent";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { hasFirstAndLastName } from "@/lib/studentName";
import { safeCallbackPath } from "@/lib/safeRedirect";
import { saveOnboardingAction, checkUsernameAvailableAction, suggestUsernamesAction } from "./actions";
import { GuardedButton } from "@/components/ui/GuardedButton";
import { buttonVariants } from "@/components/ui/button";

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", bounce: 0, duration: 0.4 } },
};

const stepVariants = {
  enter: { opacity: 0, x: 16 },
  center: { opacity: 1, x: 0, transition: { type: "spring", bounce: 0, duration: 0.36 } },
  exit: { opacity: 0, x: -16, transition: { duration: 0.15 } },
};

const INSTRUMENTS: { value: PrimaryInstrument; label: string }[] = [
  { value: "PIANO_KEYBOARD", label: "Piano / Keyboard" },
  { value: "BASS", label: "Bass" },
  { value: "GUITAR", label: "Guitar" },
  { value: "DRUMS", label: "Drums" },
  { value: "VOCAL", label: "Vocal" },
  { value: "OTHER", label: "Other" },
];

const SKILL_LEVELS: { value: SkillLevel; label: string }[] = [
  { value: "BEGINNER", label: "I'm new to it" },
  { value: "INTERMEDIATE", label: "I know the basics" },
  { value: "ADVANCED", label: "I'm experienced" },
];

const LEARNING_GOALS: { value: LearningGoal; label: string }[] = [
  { value: "LEARN_THEORY_SCALES", label: "Learn theory & scales" },
  { value: "MASTER_RHYTHM_CHORDS", label: "Master rhythm & chords" },
  { value: "PREPARE_PERFORMANCE", label: "Prepare for a performance" },
  { value: "HOBBYIST", label: "Just for fun" },
];

const STEP_TITLES = ["Who are you?", "How much do you play?"];
const LAST_STEP = STEP_TITLES.length - 1;

/**
 * A choice drawn as a button but built on a real radio input, so the selected state, the arrow keys
 * and the group name are announced by the browser instead of being faked with styling.
 */
function RadioOption({
  name,
  label,
  checked,
  onSelect,
  comingSoon,
  describedBy,
}: {
  name: string;
  label: string;
  checked: boolean;
  onSelect: () => void;
  comingSoon?: boolean;
  describedBy?: string;
}) {
  return (
    <label
      data-glass-tone={checked ? "primary" : undefined}
      className={`lgx-btn flex w-full items-center justify-between gap-2 rounded-xl px-4 py-3 text-left text-small font-medium transition-shadow has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-signal ${
        comingSoon ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      } ${checked ? "text-slate-50" : "text-slate-300 hover:text-slate-50"}`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        disabled={comingSoon}
        onChange={onSelect}
        aria-describedby={comingSoon ? describedBy : undefined}
        className="sr-only"
      />
      <span>{label}</span>
      {comingSoon && (
        // A plain fact, so a quiet word, not a shouting chip (DESIGN.md, Hierarchy rule 10).
        <span id={describedBy} className="shrink-0 text-caption text-slate-500">
          Coming soon
        </span>
      )}
    </label>
  );
}

/** The same look as RadioOption, on a real checkbox: for "tell me when it opens", where more than one can be ticked. */
function CheckOption({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <label
      data-glass-tone={checked ? "primary" : undefined}
      className={`lgx-btn flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-4 py-3 text-left text-small font-medium transition-shadow has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-signal ${
        checked ? "text-slate-50" : "text-slate-300 hover:text-slate-50"
      }`}
    >
      <input type="checkbox" checked={checked} onChange={onToggle} className="sr-only" />
      <span>{label}</span>
      <span className="shrink-0 text-caption text-slate-500">{checked ? "We'll tell you" : "Tell me"}</span>
    </label>
  );
}

export function OnboardingWizard({ initialInstrument = null, askFullName = false, initialName = "" }: { initialInstrument?: PrimaryInstrument | null; askFullName?: boolean; initialName?: string }) {
  const router = useRouter();
  const { update } = useSession();
  const uid = useId();

  const [step, setStep] = useState(0);
  const [username, setUsernameValue] = useState("");
  // Only when the account has one word for a name (Sign in with Google): the first and last name, as it appears on their bank account.
  const [fullName, setFullName] = useState(initialName);
  const fullNameValid = !askFullName || hasFirstAndLastName(fullName);
  const [instrument, setInstrument] = useState<PrimaryInstrument | null>(initialInstrument);
  // Instruments we do not teach yet that the student wants to hear about (they cannot be picked as THE instrument).
  const [waitlist, setWaitlist] = useState<PrimaryInstrument[]>([]);
  // Free usernames built from their name: shown before they type, and again whenever the one they tried is not usable.
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [skillLevel, setSkillLevel] = useState<SkillLevel | null>(null);
  const [goal, setGoal] = useState<LearningGoal | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const touchedInstrument = useRef(initialInstrument !== null);
  const firstRender = useRef(true);

  // Start with the instrument the visitor picked on the home page, unless they have already chosen here.
  useEffect(() => {
    if (touchedInstrument.current) return;
    try {
      const intent = parseInstrumentIntent(window.sessionStorage.getItem(INSTRUMENT_INTENT_KEY));
      if (intent) setInstrument(intent);
    } catch {
      /* storage can be blocked; nothing is preselected */
    }
  }, []);

  // Offer a few free usernames from their name so the first field is a tap, not an invention. Best effort: no suggestions is fine.
  useEffect(() => {
    let cancelled = false;
    suggestUsernamesAction()
      .then((list) => {
        if (!cancelled) setSuggestions(list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // A new step moves focus to its heading so a keyboard or screen reader user lands on it.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  // A new error takes focus to where it can be fixed.
  useEffect(() => {
    if (error && step === 0 && /username|characters|taken|available/i.test(error)) usernameRef.current?.focus();
  }, [error, step]);

  const usernameValid = username.trim().length >= 3;
  // Someone who only wants an instrument we do not teach yet can still go on: they are saved as "Other" and put on the list.
  const hasInstrumentChoice = instrument !== null || waitlist.length > 0;
  const canAdvance = step === 0 ? usernameValid && fullNameValid && hasInstrumentChoice : true;

  function chooseInstrument(value: PrimaryInstrument) {
    touchedInstrument.current = true;
    setInstrument(value);
  }

  function toggleWaitlist(value: PrimaryInstrument) {
    setWaitlist((current) => (current.includes(value) ? current.filter((v) => v !== value) : [...current, value]));
  }

  async function save() {
    if (!hasInstrumentChoice) return;
    setSubmitting(true);
    const result = await saveOnboardingAction({ username, fullName: askFullName ? fullName : undefined, primaryInstrument: instrument, skillLevel, genres: [], learningGoal: goal, waitlist });
    if (!result.ok) {
      setError(result.error);
      // A username problem found only now (taken a moment ago) is fixed on the first step, where the field is: take them there with
      // the reason and fresh suggestions, instead of leaving the message on a screen with nothing to type in.
      if (/username|taken|available|characters|first and last name/i.test(result.error)) {
        setStep(0);
        checkUsernameAvailableAction(username)
          .then((again) => setSuggestions(again.suggestions ?? []))
          .catch(() => undefined);
      }
      setSubmitting(false);
      return;
    }
    try {
      window.sessionStorage.removeItem(INSTRUMENT_INTENT_KEY);
    } catch {
      /* ignore */
    }

    await update();
    // Back to where they were going before the wizard (?next=, set by the middleware), else Home. Only a plain in-app path.
    router.push(safeCallbackPath(new URLSearchParams(window.location.search).get("next"), "/dashboard"));
    router.refresh();
  }

  async function handleNext() {
    setError(null);

    if (step === 0) {
      setCheckingUsername(true);
      const result = await checkUsernameAvailableAction(username);
      setCheckingUsername(false);
      if (!result.available) {
        setError(result.reason ?? "That username isn't available.");
        setSuggestions(result.suggestions ?? []);
        return;
      }
    }

    if (step < LAST_STEP) {
      setStep((s) => s + 1);
      return;
    }

    await save();
  }

  function handleBack() {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  const usernameHintId = `${uid}-username-hint`;
  const errorId = `${uid}-error`;
  const busy = submitting || checkingUsername;

  return (
    <motion.div variants={cardVariants} initial="hidden" animate="visible" className="w-full glass-surface-elevated p-7">
      {/* Where you are, said once: two short bars and "Step 1 of 2". The row of numbered markers that used to sit above this
          repeated the step's name right over the heading, so the name was on screen twice and the count three times. */}
      <div className="flex items-center gap-3">
        <div aria-hidden className="flex gap-1.5">
          {STEP_TITLES.map((title, i) => (
            <span key={title} className={`h-1 w-8 rounded-full transition-colors ${i <= step ? "bg-signal" : "bg-slate-50/12"}`} />
          ))}
        </div>
        <p className="text-caption font-medium text-slate-500">
          Step {step + 1} of {STEP_TITLES.length}
        </p>
      </div>
      <h1 ref={headingRef} tabIndex={-1} className="font-hero text-headline font-bold text-balance mt-3 text-slate-50 outline-none">
        {STEP_TITLES[step]}
      </h1>

      <AnimatePresence mode="wait">
        <motion.div key={step} variants={stepVariants} initial="enter" animate="center" exit="exit" className="mt-6 space-y-5">
          {step === 0 && (
            <>
              {askFullName && (
                <div>
                  <label htmlFor={`${uid}-fullname`} className="mb-1.5 block text-small font-medium text-slate-400">
                    First and last name
                  </label>
                  <div className="glass-surface-subtle focus-within:border-slate-50/60">
                    <input
                      id={`${uid}-fullname`}
                      type="text"
                      autoFocus
                      autoComplete="name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      aria-invalid={error && /first and last name/i.test(error) ? true : undefined}
                      placeholder="First and last name"
                      className="w-full bg-transparent px-4 py-3 text-body text-slate-100 outline-none"
                    />
                  </div>
                  <p className="mt-1.5 text-small text-slate-400">The way it appears on your bank account, so we can match your payments to you.</p>
                </div>
              )}
              <div>
                <label htmlFor={`${uid}-username`} className="mb-1.5 block text-small font-medium text-slate-400">
                  Username
                </label>
                <div className="flex items-center glass-surface-subtle pl-4 focus-within:border-slate-50/60">
                  <span className="text-small text-slate-500" aria-hidden="true">
                    @
                  </span>
                  <input
                    id={`${uid}-username`}
                    ref={usernameRef}
                    type="text"
                    autoFocus={!askFullName}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={username}
                    onChange={(e) => setUsernameValue(e.target.value)}
                    aria-invalid={error && step === 0 ? true : undefined}
                    aria-describedby={error && step === 0 ? `${usernameHintId} ${errorId}` : usernameHintId}
                    placeholder="yourname"
                    className="w-full bg-transparent px-2 py-3 text-body text-slate-100 outline-none"
                  />
                </div>
                <p id={usernameHintId} className="mt-1.5 text-small text-slate-400">
                  3 to 20 characters: lowercase letters, numbers and underscores.
                </p>
                {suggestions.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label="Suggested usernames">
                    <span className="text-small text-slate-500">Try</span>
                    {suggestions.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => {
                          setUsernameValue(name);
                          setError(null);
                        }}
                        className="lgx-btn tap inline-flex items-center rounded-full px-3 py-1 text-small font-medium text-slate-300 transition hover:text-slate-50"
                      >
                        @{name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <fieldset>
                <legend className="mb-2 text-small font-medium text-slate-400">What do you want to learn?</legend>
                <div className="space-y-2">
                  {INSTRUMENTS.map((opt) => (
                    <RadioOption
                      key={opt.value}
                      name={`${uid}-instrument`}
                      label={opt.label}
                      checked={instrument === opt.value}
                      onSelect={() => chooseInstrument(opt.value)}
                      comingSoon={INSTRUMENTS_COMING_SOON.has(opt.value)}
                      describedBy={`${uid}-soon-${opt.value}`}
                    />
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-1 text-small font-medium text-slate-400">Want drums or vocal?</legend>
                <p className="mb-2 text-small text-slate-500">We don&apos;t teach them yet. Tick one and we&apos;ll tell you first when it opens.</p>
                <div className="space-y-2">
                  {INSTRUMENTS.filter((opt) => INSTRUMENTS_COMING_SOON.has(opt.value)).map((opt) => (
                    <CheckOption key={opt.value} label={opt.label} checked={waitlist.includes(opt.value)} onToggle={() => toggleWaitlist(opt.value)} />
                  ))}
                </div>
                {instrument === null && waitlist.length > 0 && (
                  <p className="mt-2 text-small text-slate-400">Until they open we&apos;ll set your instrument to Other. You can change it any time in your profile.</p>
                )}
              </fieldset>
            </>
          )}

          {step === 1 && (
            <>
              <fieldset>
                <legend className="mb-2 text-small font-medium text-slate-400">Your level</legend>
                <div className="space-y-2">
                  {SKILL_LEVELS.map((opt) => (
                    <RadioOption key={opt.value} name={`${uid}-level`} label={opt.label} checked={skillLevel === opt.value} onSelect={() => setSkillLevel(opt.value)} />
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-2 text-small font-medium text-slate-400">Your main goal (optional)</legend>
                <div className="space-y-2">
                  {LEARNING_GOALS.map((opt) => (
                    <RadioOption key={opt.value} name={`${uid}-goal`} label={opt.label} checked={goal === opt.value} onSelect={() => setGoal(opt.value)} />
                  ))}
                </div>
              </fieldset>
              <p className="text-small text-slate-400">Both are optional. You can change them any time in Settings.</p>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      <div aria-live="assertive" role="status">
        {error && (
          <p id={errorId} role="alert" className="mt-4 text-small text-red-400">
            {error}
          </p>
        )}
      </div>

      <div className="mt-6 flex items-center gap-2">
        {step > 0 && (
          <button type="button" onClick={handleBack} disabled={busy} className={buttonVariants({ variant: "ghost" })}>
            Back
          </button>
        )}
        <GuardedButton
          reason={busy ? null : step === 0 && !fullNameValid ? "Enter your first and last name" : step === 0 && !usernameValid ? "Username needs 3 or more characters" : step === 0 && !hasInstrumentChoice ? "Pick your instrument" : null}
          onClick={() => {
            if (!busy && canAdvance) void handleNext();
          }}
          className={buttonVariants({ variant: "primary", size: "sm", className: "flex flex-1" })}
        >
          {busy && <MorphingSquare size={14} className="mr-1.5 shrink-0" />}
          {checkingUsername ? "Checking…" : submitting ? "Saving…" : step < LAST_STEP ? "Next" : "Finish"}
        </GuardedButton>
      </div>
    </motion.div>
  );
}

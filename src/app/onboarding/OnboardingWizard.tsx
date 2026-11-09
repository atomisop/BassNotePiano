"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import type { LearningGoal, PrimaryInstrument, SkillLevel } from "@prisma/client";
import { INSTRUMENTS_COMING_SOON } from "@/lib/classRegistrationLabels";
import { INSTRUMENT_INTENT_KEY, parseInstrumentIntent } from "@/lib/instrumentIntent";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { saveOnboardingAction, checkUsernameAvailableAction } from "./actions";
import { Stepper } from "@/components/ui/Stepper";
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
      className={`flex w-full items-center justify-between gap-2 rounded-xl bg-neu-base px-4 py-3 text-left text-small font-medium transition-shadow has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-signal ${
        comingSoon ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      } ${checked ? "text-signal-fg shadow-pressed-low ring-1 ring-signal" : "text-slate-300 shadow-raised-low hover:text-slate-50"}`}
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
        <span id={describedBy} className="shrink-0 rounded-full bg-neu-base shadow-pressed-low px-1.5 py-0.5 text-small font-semibold uppercase tracking-wide text-slate-400">
          Coming soon
        </span>
      )}
    </label>
  );
}

export function OnboardingWizard({ initialInstrument = null }: { initialInstrument?: PrimaryInstrument | null }) {
  const router = useRouter();
  const { update } = useSession();
  const uid = useId();

  const [step, setStep] = useState(0);
  const [username, setUsernameValue] = useState("");
  const [instrument, setInstrument] = useState<PrimaryInstrument | null>(initialInstrument);
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
  const canAdvance = step === 0 ? usernameValid && instrument !== null : true;

  function chooseInstrument(value: PrimaryInstrument) {
    touchedInstrument.current = true;
    setInstrument(value);
  }

  async function save() {
    if (!instrument) return;
    setSubmitting(true);
    const result = await saveOnboardingAction({ username, primaryInstrument: instrument, skillLevel, genres: [], learningGoal: goal });
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    try {
      window.sessionStorage.removeItem(INSTRUMENT_INTENT_KEY);
    } catch {
      /* ignore */
    }

    await update();
    router.push("/dashboard");
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
      <div className="mb-6">
        <Stepper orientation="horizontal" current={step} steps={STEP_TITLES.map((title) => ({ title }))} />
      </div>

      <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">
        Step {step + 1} of {STEP_TITLES.length}
      </p>
      <h1 ref={headingRef} tabIndex={-1} className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50 outline-none">
        {STEP_TITLES[step]}
      </h1>

      <AnimatePresence mode="wait">
        <motion.div key={step} variants={stepVariants} initial="enter" animate="center" exit="exit" className="mt-6 space-y-5">
          {step === 0 && (
            <>
              <div>
                <label htmlFor={`${uid}-username`} className="mb-1.5 block text-small font-medium text-slate-50/80">
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
                    autoFocus
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
              </div>

              <fieldset>
                <legend className="mb-2 text-small font-medium text-slate-50/80">What do you want to learn?</legend>
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
            </>
          )}

          {step === 1 && (
            <>
              <fieldset>
                <legend className="mb-2 text-small font-medium text-slate-50/80">Your level</legend>
                <div className="space-y-2">
                  {SKILL_LEVELS.map((opt) => (
                    <RadioOption key={opt.value} name={`${uid}-level`} label={opt.label} checked={skillLevel === opt.value} onSelect={() => setSkillLevel(opt.value)} />
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-2 text-small font-medium text-slate-50/80">Your main goal (optional)</legend>
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
          <button type="button" onClick={handleBack} disabled={busy} className={buttonVariants({ variant: "secondary" })}>
            Back
          </button>
        )}
        <GuardedButton
          reason={busy ? null : step === 0 && !usernameValid ? "Username needs 3 or more characters" : step === 0 && instrument === null ? "Pick your instrument" : null}
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

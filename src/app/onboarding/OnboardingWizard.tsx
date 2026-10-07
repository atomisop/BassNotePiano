"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import type { LearningGoal, MusicGenre, PrimaryInstrument, SkillLevel } from "@prisma/client";
import { INSTRUMENTS_COMING_SOON } from "@/lib/classRegistrationLabels";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { saveOnboardingAction, checkUsernameAvailableAction } from "./actions";
import { Stepper } from "@/components/ui/Stepper";

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
  { value: "BEGINNER", label: "Beginner" },
  { value: "INTERMEDIATE", label: "Intermediate" },
  { value: "ADVANCED", label: "Advanced" },
];

const GENRES: { value: MusicGenre; label: string }[] = [
  { value: "JAZZ", label: "Jazz" },
  { value: "CLASSICAL", label: "Classical" },
  { value: "RNB", label: "R&B" },
  { value: "ROCK", label: "Rock" },
  { value: "POP", label: "Pop" },
  { value: "GOSPEL", label: "Gospel" },
];

const LEARNING_GOALS: { value: LearningGoal; label: string }[] = [
  { value: "LEARN_THEORY_SCALES", label: "Learn theory & scales" },
  { value: "MASTER_RHYTHM_CHORDS", label: "Master rhythm & chords" },
  { value: "PREPARE_PERFORMANCE", label: "Prepare for a performance" },
  { value: "HOBBYIST", label: "Just for fun (hobbyist)" },
];

const STEP_TITLES = ["Your username", "Your instrument", "Your skill level", "Your genres", "Your goal"];
/** Steps up to and including this one are required. The rest can be skipped and filled in later from the profile. */
const LAST_REQUIRED_STEP = 1;

function OptionButton({
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
    // disabled when comingSoon: same fix as ClassRegistrationForm's Pill.
    // A "Coming soon" tag on an option you can still click and select reads
    // as a bug, not a feature.
    <button
      type="button"
      onClick={onClick}
      disabled={comingSoon}
      className={`flex w-full items-center justify-between gap-2 rounded-xl bg-neu-base px-4 py-3 text-left text-small font-medium transition-shadow disabled:cursor-not-allowed disabled:opacity-50 ${
        selected
          ? "text-signal shadow-pressed-low ring-1 ring-signal"
          : "text-slate-300 shadow-raised-low hover:text-slate-50"
      }`}
    >
      {label}
      {comingSoon && (
        <span className="shrink-0 rounded-full bg-neu-base shadow-pressed-low px-1.5 py-0.5 text-small font-semibold uppercase tracking-wide text-slate-400">
          Coming soon
        </span>
      )}
    </button>
  );
}

export function OnboardingWizard() {
  const router = useRouter();
  const { update } = useSession();

  const [step, setStep] = useState(0);
  const [username, setUsernameValue] = useState("");
  const [instrument, setInstrument] = useState<PrimaryInstrument | null>(null);
  const [skillLevel, setSkillLevel] = useState<SkillLevel | null>(null);
  const [genres, setGenres] = useState<MusicGenre[]>([]);
  const [goal, setGoal] = useState<LearningGoal | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleGenre(value: MusicGenre) {
    setGenres((prev) => (prev.includes(value) ? prev.filter((g) => g !== value) : [...prev, value]));
  }

  // Only the username and the instrument are needed to get going.
  const canAdvance = step === 0 ? username.trim().length >= 3 : step === 1 ? instrument !== null : true;
  const optional = step > LAST_REQUIRED_STEP;

  const lastStep = STEP_TITLES.length - 1;

  async function save() {
    if (!instrument) return;
    setSubmitting(true);
    const result = await saveOnboardingAction({ username, primaryInstrument: instrument, skillLevel, genres, learningGoal: goal });
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
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

    if (step < lastStep) {
      setStep((s) => s + 1);
      return;
    }

    await save();
  }

  /** Skips this step's question, and finishes if it was the last. */
  async function handleSkip() {
    setError(null);
    if (step === 2) setSkillLevel(null);
    if (step === 3) setGenres([]);
    if (step === 4) setGoal(null);
    if (step < lastStep) {
      setStep((s) => s + 1);
      return;
    }
    await save();
  }

  function handleBack() {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className="w-full glass-surface-elevated p-7"
    >
      {/* Replaces five undifferentiated bars. The horizontal Stepper marks
          completed steps with a check, the current one with a filled marker,
          and carries `aria-current="step"`, so the position is announced
          rather than only drawn. */}
      <div className="mb-6">
        <Stepper
          orientation="horizontal"
          current={step}
          steps={STEP_TITLES.map((title) => ({ title }))}
        />
      </div>

      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">
        Step {step + 1} of {STEP_TITLES.length}
        {optional ? " · optional" : ""}
      </p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">{STEP_TITLES[step]}</h1>

      <AnimatePresence mode="wait">
        <motion.div key={step} variants={stepVariants} initial="enter" animate="center" exit="exit" className="mt-6 space-y-2">
          {step === 0 && (
            <div className="flex items-center glass-surface-subtle pl-4 focus-within:border-[rgb(var(--c-s-50)/0.6)]">
              <span className="text-small text-slate-500">@</span>
              <input
                type="text"
                autoFocus
                value={username}
                onChange={(e) => setUsernameValue(e.target.value)}
                placeholder="yourname"
                className="w-full bg-transparent px-2 py-3 text-body text-slate-100 outline-none"
              />
            </div>
          )}
          {step === 1 &&
            INSTRUMENTS.map((opt) => (
              <OptionButton
                key={opt.value}
                label={opt.label}
                selected={instrument === opt.value}
                onClick={() => setInstrument(opt.value)}
                comingSoon={INSTRUMENTS_COMING_SOON.has(opt.value)}
              />
            ))}
          {step === 2 &&
            SKILL_LEVELS.map((opt) => (
              <OptionButton
                key={opt.value}
                label={opt.label}
                selected={skillLevel === opt.value}
                onClick={() => setSkillLevel(opt.value)}
              />
            ))}
          {step === 3 &&
            GENRES.map((opt) => (
              <OptionButton
                key={opt.value}
                label={opt.label}
                selected={genres.includes(opt.value)}
                onClick={() => toggleGenre(opt.value)}
              />
            ))}
          {step === 4 &&
            LEARNING_GOALS.map((opt) => (
              <OptionButton
                key={opt.value}
                label={opt.label}
                selected={goal === opt.value}
                onClick={() => setGoal(opt.value)}
              />
            ))}
        </motion.div>
      </AnimatePresence>

      {error && <p className="mt-4 text-small text-red-400">{error}</p>}
      {step === 0 && <p className="mt-4 text-small text-slate-500">Only your username and instrument are needed. The rest is optional, and you can change any of it later in your profile.</p>}

      {step === LAST_REQUIRED_STEP && instrument !== null && (
        <button type="button" onClick={save} disabled={submitting} className="mt-4 text-small font-medium text-slate-400 underline-offset-4 transition hover:text-slate-100 hover:underline disabled:opacity-60">
          Finish now, I&apos;ll fill in the rest later
        </button>
      )}

      <div className="mt-6 flex items-center gap-2">
        {step > 0 && (
          <button
            type="button"
            onClick={handleBack}
            disabled={submitting}
            className="rounded-xl px-4 py-2.5 text-small font-medium text-slate-300 transition disabled:cursor-not-allowed disabled:opacity-60 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
          >
            Back
          </button>
        )}
        <button
          type="button"
          onClick={handleNext}
          disabled={!canAdvance || submitting || checkingUsername}
          className="cta-sheen cta-fill flex flex-1 items-center justify-center rounded-xl py-2.5 text-small font-semibold disabled:cursor-not-allowed disabled:opacity-60"
        >
          {(checkingUsername || submitting) && <MorphingSquare size={14} className="mr-1.5 shrink-0" />}
          {checkingUsername ? "Checking…" : submitting ? "Saving…" : step < lastStep ? "Next" : "Finish"}
        </button>
        {optional && (
          <button
            type="button"
            onClick={handleSkip}
            disabled={submitting}
            className="rounded-xl px-4 py-2.5 text-small font-medium text-slate-300 transition disabled:cursor-not-allowed disabled:opacity-60 bg-neu-base shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
          >
            Skip
          </button>
        )}
      </div>
    </motion.div>
  );
}

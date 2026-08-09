"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import type { LearningGoal, MusicGenre, PrimaryInstrument, SkillLevel } from "@prisma/client";
import { saveOnboardingAction, checkUsernameAvailableAction } from "./actions";

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 260, damping: 26 } },
};

const stepVariants = {
  enter: { opacity: 0, x: 16 },
  center: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 30 } },
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

function OptionButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${
        selected
          ? "border-amber-400/60 bg-amber-400/10 text-amber-200"
          : "border-ink/10 bg-slate-950 text-slate-300 hover:border-ink/15"
      }`}
    >
      {label}
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

  const canAdvance = [
    username.trim().length >= 3,
    instrument !== null,
    skillLevel !== null,
    genres.length > 0,
    goal !== null,
  ][step];

  const lastStep = STEP_TITLES.length - 1;

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

    if (!instrument || !skillLevel || !goal) return;

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

  function handleBack() {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className="w-full max-w-md glass-surface-elevated p-7"
    >
      <div className="mb-6 flex items-center gap-1.5">
        {STEP_TITLES.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition ${i <= step ? "bg-amber-400" : "bg-slate-800"}`}
          />
        ))}
      </div>

      <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">
        Step {step + 1} of {STEP_TITLES.length}
      </p>
      <h1 className="mt-1.5 font-serif text-2xl text-slate-50">{STEP_TITLES[step]}</h1>
      <p className="mt-2 text-sm text-slate-500">A few quick questions to personalize your dashboard.</p>

      <AnimatePresence mode="wait">
        <motion.div key={step} variants={stepVariants} initial="enter" animate="center" exit="exit" className="mt-6 space-y-2">
          {step === 0 && (
            <div className="flex items-center rounded-xl border border-ink/10 bg-slate-950 pl-4 focus-within:border-amber-400/60">
              <span className="text-sm text-slate-500">@</span>
              <input
                type="text"
                autoFocus
                value={username}
                onChange={(e) => setUsernameValue(e.target.value)}
                placeholder="yourname"
                className="w-full bg-transparent px-2 py-3 text-sm text-slate-100 outline-none"
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

      {error && <p className="mt-4 text-xs text-red-400">{error}</p>}

      <div className="mt-6 flex items-center gap-2">
        {step > 0 && (
          <button
            type="button"
            onClick={handleBack}
            disabled={submitting}
            className="rounded-xl border border-ink/10 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:border-ink/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Back
          </button>
        )}
        <button
          type="button"
          onClick={handleNext}
          disabled={!canAdvance || submitting || checkingUsername}
          className="cta-sheen flex-1 rounded-xl bg-amber-400 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {checkingUsername ? "Checking…" : submitting ? "Saving…" : step < lastStep ? "Next" : "Finish"}
        </button>
      </div>
    </motion.div>
  );
}

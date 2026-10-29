"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { PASSWORD_RULES, isGuessablePassword, passwordScore, type PasswordRule } from "@/lib/passwordRules";

// "Password Strength" from 21st.dev by ddoemonn (segmented strength bars, a live requirements checklist and common-pattern
// detection), used as published. Changes for this app: it imports motion from framer-motion, takes its rules from
// src/lib/passwordRules.ts (the same rules the servers enforce), and uses this app's colours.

const CELL = { type: "spring", stiffness: 520, damping: 34, mass: 0.45 } as const;
const CROSSFADE = { type: "spring", stiffness: 260, damping: 34, mass: 0.8 } as const;
const INSTANT = { duration: 0 } as const;

const LABELS = ["Empty", "Weak", "Fair", "Good", "Strong"] as const;

const TONES = {
  none: { bar: "bg-slate-50/20", text: "text-slate-400" },
  danger: { bar: "bg-red-500", text: "text-red-400" },
  caution: { bar: "bg-amber-500", text: "text-amber-400" },
  safe: { bar: "bg-signal", text: "text-signal-fg" },
} as const;

function toneFor(score: number, max: number) {
  if (score === 0) return TONES.none;
  const ratio = score / max;
  if (ratio <= 0.34) return TONES.danger;
  if (ratio <= 0.67) return TONES.caution;
  return TONES.safe;
}

export interface PasswordStrengthProps {
  value: string;
  rules?: readonly PasswordRule[];
  showRules?: boolean;
  className?: string;
}

export function PasswordStrength({ value, rules = PASSWORD_RULES, showRules = true, className = "" }: PasswordStrengthProps) {
  const max = rules.length;
  const score = useMemo(() => passwordScore(value, rules), [value, rules]);
  const guessable = isGuessablePassword(value);
  const evaluated = useMemo(() => rules.map((rule) => ({ ...rule, met: rule.test(value) })), [rules, value]);
  const label = LABELS[Math.min(score, LABELS.length - 1)];
  const reduced = useReducedMotion();
  const tone = toneFor(score, max);

  // Screen readers hear a summary once typing pauses, not on every key.
  const unmet = evaluated.filter((r) => !r.met);
  const announcement =
    value.length === 0
      ? ""
      : [
          `Password strength ${label.toLowerCase()}.`,
          guessable ? "This is a commonly guessed pattern." : "",
          unmet.length === 0 ? "All requirements met." : `Still needed: ${unmet.map((r) => r.label.toLowerCase()).join(", ")}.`,
        ]
          .filter(Boolean)
          .join(" ");
  const [settled, setSettled] = useState("");
  useEffect(() => {
    if (announcement === "") {
      setSettled("");
      return;
    }
    const id = setTimeout(() => setSettled(announcement), 700);
    return () => clearTimeout(id);
  }, [announcement]);

  return (
    <div className={`w-full ${className}`}>
      <div
        role="meter"
        aria-label="Password strength"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={score}
        aria-valuetext={label}
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${max}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: max }, (_, i) => (
          <div key={i} className="relative h-1.5 overflow-hidden rounded-[2px] bg-slate-50/10">
            <motion.span
              className={`absolute inset-0 origin-left rounded-[2px] transition-colors duration-200 ${tone.bar}`}
              initial={false}
              animate={{ scaleX: i < score ? 1 : 0 }}
              transition={reduced ? INSTANT : { ...CELL, delay: i < score ? i * 0.03 : 0 }}
            />
          </div>
        ))}
      </div>

      <div className="mt-2 flex h-5 items-center justify-between gap-3">
        <span className="inline-grid text-small font-medium leading-5">
          {LABELS.map((text, i) => (
            <motion.span
              key={text}
              aria-hidden
              className={`col-start-1 row-start-1 whitespace-nowrap transition-colors duration-200 ${tone.text}`}
              initial={false}
              animate={{ opacity: i === Math.min(score, LABELS.length - 1) ? 1 : 0 }}
              transition={reduced ? INSTANT : CROSSFADE}
            >
              {text}
            </motion.span>
          ))}
        </span>

        <motion.span
          aria-hidden
          className="whitespace-nowrap text-small leading-5 text-amber-400"
          initial={false}
          animate={{ opacity: guessable ? 1 : 0 }}
          transition={reduced ? INSTANT : CROSSFADE}
        >
          Commonly guessed
        </motion.span>
      </div>

      {showRules && (
        <ul className="mt-3 grid gap-1.5">
          {evaluated.map((rule) => (
            <li key={rule.id} className="flex items-center gap-2">
              <span className="relative grid size-[14px] shrink-0 place-items-center rounded-sm border border-slate-50/20 text-slate-950">
                <motion.span
                  className="absolute inset-0 rounded-[3px] bg-signal"
                  initial={false}
                  animate={{ opacity: rule.met ? 1 : 0 }}
                  transition={reduced ? INSTANT : CROSSFADE}
                />
                <motion.svg
                  viewBox="0 0 12 12"
                  fill="none"
                  aria-hidden
                  className="relative size-[9px]"
                  initial={false}
                  animate={{ opacity: rule.met ? 1 : 0, scale: rule.met ? 1 : 0.6 }}
                  transition={reduced ? INSTANT : CELL}
                >
                  <path d="M2 6.2 4.7 8.9 10 3.3" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
                </motion.svg>
              </span>
              <span className={`text-small leading-5 transition-colors duration-200 ${rule.met ? "text-slate-100" : "text-slate-500"}`}>{rule.label}</span>
              <span className="sr-only">{rule.met ? "met" : "not met"}</span>
            </li>
          ))}
        </ul>
      )}

      <p aria-live="polite" className="sr-only">
        {settled}
      </p>
    </div>
  );
}

export default PasswordStrength;

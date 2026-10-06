"use client";

import { createRef, forwardRef, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Award, Check, ListChecks, Lock, Users, Video } from "lucide-react";
import { AnimatedBeam } from "@/components/ui/animated-beam";
import { BorderBeam } from "@/components/ui/border-beam";
import { cn } from "@/lib/utils";

// Calm, looping pictures that say what the paragraphs used to say. Built from
// two 21st.dev pieces (Animated Beam, Border Beam) plus small framer-motion
// loops. Everything is slow, and nothing moves for people who ask for less.

const ORANGE = "#fb8a5c";
const ORANGE_SOFT = "#ffd9c4";

/** Steps 0..count: counts up one at a time, rests, then starts over. */
function useCycle(count: number, stepMs: number, restMs: number) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setActive((a) => (a >= count ? 0 : a + 1)), active >= count ? restMs : stepMs);
    return () => clearTimeout(timer);
  }, [active, count, stepMs, restMs]);
  return active;
}

function useRefs(count: number): RefObject<HTMLDivElement>[] {
  return useMemo(() => Array.from({ length: count }, () => createRef<HTMLDivElement>()), [count]);
}

const Node = forwardRef<HTMLDivElement, { on: boolean; size?: "sm" | "md" | "lg"; children: ReactNode }>(function Node({ on, size = "md", children }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        "relative z-10 flex items-center justify-center rounded-full bg-neu-base transition-all duration-700",
        size === "lg" ? "h-16 w-16" : size === "sm" ? "h-9 w-9" : "h-12 w-12",
        on ? "text-[rgb(var(--signal))] shadow-pressed-low ring-1 ring-[rgb(var(--signal)/0.5)]" : "text-slate-500 shadow-raised-low",
      )}
    >
      {children}
    </div>
  );
});

function Beams({ containerRef, refs, reduced }: { containerRef: RefObject<HTMLDivElement>; refs: RefObject<HTMLDivElement>[]; reduced: boolean | null }) {
  if (reduced) return null;
  return (
    <>
      {refs.slice(0, -1).map((from, i) => (
        <AnimatedBeam
          key={i}
          containerRef={containerRef}
          fromRef={from}
          toRef={refs[i + 1]}
          duration={5}
          delay={i * 1.1}
          pathColor="#94a3b8"
          pathOpacity={0.25}
          pathWidth={2}
          gradientStartColor={ORANGE}
          gradientStopColor={ORANGE_SOFT}
        />
      ))}
    </>
  );
}

/** Hero: scales opening one after another along a path. */
export function ScaleJourney({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  const refs = useRefs(5);
  const containerRef = useRef<HTMLDivElement>(null);
  const active = useCycle(5, 1500, 2600);
  const unlocked = reduced ? 3 : active;

  return (
    <div ref={containerRef} className={cn("relative flex w-full max-w-sm items-center justify-between py-3", className)} role="img" aria-label="Scales opening one after another">
      {refs.map((ref, i) => {
        const on = i < unlocked;
        return (
          <Node key={i} ref={ref} on={on}>
            {on ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <Lock className="h-3.5 w-3.5" />}
          </Node>
        );
      })}
      <Beams containerRef={containerRef} refs={refs} reduced={reduced} />
    </div>
  );
}

const STEP_ICONS = [
  { Icon: Video, label: "Class" },
  { Icon: ListChecks, label: "Quiz" },
  { Icon: Award, label: "Badge" },
];

/** How it works: class, then quiz, then badge, with a light travelling between them. */
export function StepsLoop() {
  const reduced = useReducedMotion();
  const refs = useRefs(3);
  const containerRef = useRef<HTMLDivElement>(null);
  const active = useCycle(3, 1900, 2800);
  const lit = reduced ? 3 : active;

  return (
    <div className="mx-auto w-full max-w-md" role="img" aria-label="Class, then quiz, then badge">
      <div ref={containerRef} className="relative flex items-center justify-between py-2">
        {STEP_ICONS.map(({ Icon }, i) => (
          <Node key={i} ref={refs[i]} on={i < lit} size="lg">
            <Icon className="h-6 w-6" strokeWidth={1.75} />
          </Node>
        ))}
        <Beams containerRef={containerRef} refs={refs} reduced={reduced} />
      </div>
      <div className="mt-3 flex items-center justify-between text-small text-slate-400">
        {STEP_ICONS.map(({ label }) => (
          <span key={label} className="w-16 text-center">
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Tile({ caption, delay, children }: { caption: string; delay: number; children: ReactNode }) {
  return (
    <div className="relative flex h-40 flex-col items-center justify-between overflow-hidden rounded-2xl bg-neu-base p-3 shadow-raised-low sm:p-5">
      <BorderBeam size={120} duration={9} delay={delay} colorFrom={ORANGE} colorTo={ORANGE_SOFT} borderWidth={1.5} />
      <div className="flex flex-1 items-center justify-center">{children}</div>
      <p className="text-center text-small font-medium leading-tight text-slate-300">{caption}</p>
    </div>
  );
}

/** Three notes rising and settling into a chord. */
function ChordViz({ reduced }: { reduced: boolean | null }) {
  const heights = [28, 44, 60];
  return (
    <div className="flex items-end gap-2" aria-hidden>
      {heights.map((h, i) => (
        <motion.span
          key={i}
          className="w-3 rounded-full bg-[rgb(var(--signal))]"
          initial={{ height: reduced ? h : 10, opacity: reduced ? 0.9 : 0.4 }}
          animate={reduced ? undefined : { height: [10, h, h, 10], opacity: [0.4, 1, 1, 0.4] }}
          transition={{ duration: 4.5, delay: i * 0.35, repeat: Infinity, ease: "easeInOut", times: [0, 0.35, 0.8, 1] }}
        />
      ))}
    </div>
  );
}

/** A ring filling to the pass mark, then a check. */
function QuizViz({ reduced }: { reduced: boolean | null }) {
  return (
    <div className="relative h-[72px] w-[72px]" aria-hidden>
      <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
        <circle cx="36" cy="36" r="30" fill="none" stroke="rgb(148 163 184 / 0.25)" strokeWidth="5" />
        <motion.circle
          cx="36"
          cy="36"
          r="30"
          fill="none"
          stroke={ORANGE}
          strokeWidth="5"
          strokeLinecap="round"
          initial={{ pathLength: reduced ? 0.8 : 0 }}
          animate={reduced ? undefined : { pathLength: [0, 0.8, 0.8, 0] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", times: [0, 0.45, 0.85, 1] }}
        />
      </svg>
      <motion.span
        className="absolute inset-0 flex items-center justify-center text-[rgb(var(--signal))]"
        initial={{ opacity: reduced ? 1 : 0 }}
        animate={reduced ? undefined : { opacity: [0, 0, 1, 1, 0] }}
        transition={{ duration: 5.5, repeat: Infinity, times: [0, 0.4, 0.5, 0.85, 1] }}
      >
        <Check className="h-6 w-6" strokeWidth={2.5} />
      </motion.span>
    </div>
  );
}

/** Teacher and student, with a light passing between. */
function LiveViz({ reduced }: { reduced: boolean | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const a = useRef<HTMLDivElement>(null);
  const b = useRef<HTMLDivElement>(null);
  return (
    <div ref={containerRef} className="relative flex w-full max-w-[5.5rem] items-center justify-between" aria-hidden>
      <Node ref={a} on size="sm">
        <Users className="h-4 w-4" strokeWidth={1.75} />
      </Node>
      <Node ref={b} on={false} size="sm">
        <Users className="h-4 w-4" strokeWidth={1.75} />
      </Node>
      {!reduced && (
        <>
          <AnimatedBeam containerRef={containerRef} fromRef={a} toRef={b} duration={4} pathColor="#94a3b8" pathOpacity={0.25} gradientStartColor={ORANGE} gradientStopColor={ORANGE_SOFT} />
          <AnimatedBeam containerRef={containerRef} fromRef={a} toRef={b} reverse duration={4} delay={2} pathOpacity={0} gradientStartColor={ORANGE} gradientStopColor={ORANGE_SOFT} />
        </>
      )}
    </div>
  );
}

/** The four things the product does, as pictures. */
export function FeatureLoops() {
  const reduced = useReducedMotion();
  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-4">
      <Tile caption="Chords built in" delay={0}>
        <ChordViz reduced={reduced} />
      </Tile>
      <Tile caption="Quiz to unlock" delay={3}>
        <QuizViz reduced={reduced} />
      </Tile>
      <Tile caption="Live, 45 minutes" delay={6}>
        <LiveViz reduced={reduced} />
      </Tile>
    </div>
  );
}

/** Words that arrive and leave slowly, one after another, then start over. */
export function LoopingLine({ lines, className }: { lines: string[]; className?: string }) {
  const reduced = useReducedMotion();
  let index = 0;
  return (
    <p className={className}>
      {lines.map((line, li) => (
        <span key={li} className="block">
          {line.split(" ").map((word) => {
            const i = index++;
            return reduced ? (
              <span key={i}>{word} </span>
            ) : (
              <span key={i}>
                <motion.span
                  className="inline-block"
                  initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
                  animate={{ opacity: [0, 1, 1, 0], y: [10, 0, 0, -8], filter: ["blur(6px)", "blur(0px)", "blur(0px)", "blur(6px)"] }}
                  transition={{ duration: 8, delay: i * 0.22, repeat: Infinity, ease: "easeInOut", times: [0, 0.14, 0.82, 1] }}
                >
                  {word}
                </motion.span>{" "}
              </span>
            );
          })}
        </span>
      ))}
    </p>
  );
}

/** Three quiet proof points: book, teacher, community. */
export function ProofLoops({ items }: { items: { icon: ReactNode; caption: string }[] }) {
  return (
    <ul className="grid grid-cols-3 gap-3 sm:gap-4">
      {items.map((item, i) => (
        <li key={item.caption} className="relative flex h-32 flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl bg-neu-base px-2 text-center shadow-raised-low">
          <BorderBeam size={100} duration={10} delay={i * 3.3} colorFrom={ORANGE} colorTo={ORANGE_SOFT} borderWidth={1.5} />
          <span className="text-[rgb(var(--signal))]">{item.icon}</span>
          <span className="text-small font-medium text-slate-300">{item.caption}</span>
        </li>
      ))}
    </ul>
  );
}

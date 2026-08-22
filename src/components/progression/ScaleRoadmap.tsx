"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import type { ProgressStatus } from "@prisma/client";
import type { ScaleAccessState } from "@/lib/access";
import { ctaLabel } from "@/lib/ctaLabel";
import { ProOverrideConfirmModal } from "@/components/progression/ProOverrideConfirmModal";

export interface ScaleRoadmapProps {
  roadmap: ScaleAccessState[];
}

const STATUS_LABEL: Record<ProgressStatus, string> = {
  LOCKED: "Locked",
  AVAILABLE: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
};

const gridContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const gridItem = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", bounce: 0, duration: 0.4 } },
};

/**
 * The three-item checklist, drawn as a segmented bar rather than three loose
 * dots. A scale is 2/3 done or it isn't — a bar says that at a glance, where
 * three separate dots make the reader count.
 */
function Checklist({ scale, emphasised }: { scale: ScaleAccessState; emphasised: boolean }) {
  const items = [
    { label: "Module", done: scale.moduleRead },
    { label: "Practice", done: scale.practiceCompleted },
    { label: "Quiz", done: scale.quizPassed },
  ];
  const doneCount = items.filter((i) => i.done).length;

  return (
    <div className="mt-4">
      <div className="flex items-center gap-1.5">
        {items.map((item) => (
          <span
            key={item.label}
            className={`h-1 flex-1 rounded-full transition-colors ${
              item.done
                ? scale.status === "COMPLETED"
                  ? "bg-emerald-400"
                  : "bg-[rgb(var(--c-a-400))]"
                : "bg-slate-800"
            }`}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {items.map((item) => (
            <span
              key={item.label}
              className={`text-[11px] ${
                item.done ? "text-slate-300" : emphasised ? "text-slate-500" : "text-slate-600"
              }`}
            >
              {item.label}
            </span>
          ))}
        </div>
        <span className="text-[11px] tabular-nums text-slate-500">{doneCount}/3</span>
      </div>
    </div>
  );
}

function LockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="shrink-0"
      aria-hidden
    >
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      className="shrink-0"
      aria-hidden
    >
      <path d="M5 12l5 5L19 8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StepMarker({
  index,
  status,
  locked,
  isCurrent,
}: {
  index: number;
  status: ProgressStatus;
  locked: boolean;
  isCurrent: boolean;
}) {
  if (status === "COMPLETED") {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-400 text-slate-950">
        <CheckIcon />
      </div>
    );
  }
  if (locked) {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-ink/10 bg-slate-950 text-slate-600">
        <LockIcon />
      </div>
    );
  }
  // The current step is the only filled marker on the spine, so the eye lands
  // on it before reading any of the cards.
  if (isCurrent) {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[rgb(var(--c-a-400))] text-sm font-semibold text-slate-950">
        {index + 1}
      </div>
    );
  }
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-ink/10 bg-slate-950 text-sm font-semibold text-slate-400">
      {index + 1}
    </div>
  );
}

export function ScaleRoadmap({ roadmap }: ScaleRoadmapProps) {
  const router = useRouter();
  const { update } = useSession();
  const [pendingOverride, setPendingOverride] = useState<ScaleAccessState | null>(null);
  const [confirming, setConfirming] = useState(false);

  // "Current" is the same scale the dashboard's next-step card points at: the
  // first reachable, unfinished one. Exactly one card may carry the emphasised
  // treatment — that is what stops six cards reading as six equal demands.
  const currentIndex = roadmap.findIndex((s) => s.canAccess && s.status !== "COMPLETED");

  function handleCardClick(scale: ScaleAccessState) {
    if (scale.requiresOverrideConfirm) {
      setPendingOverride(scale);
      return;
    }
    if (scale.canAccess) {
      router.push(`/scales/${scale.scaleGroup.slug}`);
      return;
    }
    // Not accessible at all — the only way forward is buying the full
    // curriculum, regardless of which scale was clicked (per-scale purchase
    // no longer exists), so every locked card is a soft ad for /billing/curriculum.
    router.push("/billing/curriculum");
  }

  async function handleConfirmOverride() {
    if (!pendingOverride) return;
    setConfirming(true);
    // Middleware gates /scales/[slug] off the JWT, not the DB — and that
    // token can still say hasCurriculumAccess: false if it was minted before
    // curriculum access was granted. Without this refresh, the ?override=confirmed
    // request middleware sees is built on stale claims, so it bounces the
    // navigation straight back here — looking like "Confirm" did nothing.
    await update();
    router.push(`/scales/${pendingOverride.scaleGroup.slug}?override=confirmed`);
    setConfirming(false);
    setPendingOverride(null);
  }

  return (
    <>
      <motion.ol
        variants={gridContainer}
        initial="hidden"
        animate="visible"
        className="relative mx-auto max-w-2xl"
      >
        {roadmap.map((scale, index) => {
          // "locked" is purely visual now — every card is clickable, since
          // an inaccessible scale routes to /billing/curriculum rather than
          // sitting inert (buying the curriculum unlocks all of them at
          // once, so there's no reason to block the purchase entry point).
          const locked = !scale.canAccess;
          const isLast = index === roadmap.length - 1;
          const isCurrent = index === currentIndex;
          const isCompleted = scale.status === "COMPLETED";

          return (
            <motion.li key={scale.scaleGroup.slug} variants={gridItem} className="relative flex gap-4">
              <div className="flex flex-col items-center">
                <StepMarker
                  index={index}
                  status={scale.status}
                  locked={locked}
                  isCurrent={isCurrent}
                />
                {/* The spine carries progress: solid behind finished steps,
                    dotted ahead of them. A uniformly dotted line describes the
                    curriculum; this one describes the student's place in it. */}
                {!isLast && (
                  <span
                    className={`w-px flex-1 ${
                      isCompleted
                        ? "border-l-2 border-solid border-emerald-400/40"
                        : "border-l-2 border-dotted border-ink/10"
                    }`}
                  />
                )}
              </div>

              <button
                type="button"
                onClick={() => handleCardClick(scale)}
                aria-current={isCurrent ? "step" : undefined}
                className={`group mb-4 flex-1 cursor-pointer rounded-2xl border p-5 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--c-a-400)/0.7)] ${
                  isCurrent
                    ? // `shadow-card` (the theme's own --surface-shadow) rather
                      // than a hand-rolled arbitrary shadow: this project has a
                      // reproducible quirk where some arbitrary opacity
                      // modifiers compile to nothing, and a lift that silently
                      // vanishes would take the current step's emphasis with
                      // it. Not `.glass-surface-elevated` — the dashboard
                      // already spends that on the next-step card, and using it
                      // twice on a screen stops it meaning "the important one".
                      "border-[rgb(var(--c-a-400)/0.5)] bg-surface shadow-card"
                    : locked
                      ? "border-ink/10 bg-ink/5 hover:border-[rgb(var(--c-a-400)/0.3)]"
                      : "border-ink/10 bg-surface hover:border-[rgb(var(--c-a-400)/0.3)]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-a-400)/0.8)]">
                    {scale.scaleGroup.code}
                  </p>
                  {/* One badge, and only the current step gets the accent
                      version — status text alone is enough for the rest. */}
                  {isCurrent ? (
                    <span className="rounded-full bg-[rgb(var(--c-a-400)/0.15)] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--c-a-300))]">
                      You&apos;re here
                    </span>
                  ) : (
                    <span
                      className={`text-[11px] ${
                        isCompleted ? "text-emerald-400" : "text-slate-500"
                      }`}
                    >
                      {STATUS_LABEL[scale.status]}
                    </span>
                  )}
                </div>

                <h3
                  className={`mt-2 font-serif text-slate-50 ${isCurrent ? "text-xl" : "text-lg"}`}
                >
                  {scale.scaleGroup.title}
                </h3>
                {scale.scaleGroup.kinitName && (
                  <p className="mt-1 text-sm text-slate-500">{scale.scaleGroup.kinitName}</p>
                )}

                {/* A locked scale has no progress to report — showing an empty
                    checklist on it just reads as failure rather than as
                    "not bought yet". */}
                {!locked && <Checklist scale={scale} emphasised={isCurrent} />}

                {/* Reads as a control, not a stray coloured word. The whole
                    card is the click target, so this is an affordance rather
                    than a separate button — hence the group-hover tie-in. */}
                <div
                  className={`mt-5 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    isCurrent
                      ? "cta-fill group-hover:brightness-110"
                      : "border border-[rgb(var(--c-a-400)/0.4)] text-[rgb(var(--c-a-300))] group-hover:border-[rgb(var(--c-a-400))] group-hover:bg-[rgb(var(--c-a-400)/0.1)]"
                  }`}
                >
                  {locked && <LockIcon />}
                  {ctaLabel(scale)}
                  {!locked && (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden
                      className="transition-transform group-hover:translate-x-0.5"
                    >
                      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              </button>
            </motion.li>
          );
        })}
      </motion.ol>

      <ProOverrideConfirmModal
        isOpen={pendingOverride !== null}
        targetCode={pendingOverride?.scaleGroup.code ?? ""}
        isConfirming={confirming}
        onConfirm={handleConfirmOverride}
        onCancel={() => setPendingOverride(null)}
      />
    </>
  );
}

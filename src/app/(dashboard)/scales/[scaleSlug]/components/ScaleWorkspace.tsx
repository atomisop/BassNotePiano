"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { PrimaryInstrument } from "@prisma/client";
import { ArrowLeft, Check, Circle, KeyRound, Layers, ListChecks, Lock, NotebookPen, PanelLeftClose, PanelLeftOpen, Table2, Timer, FileText, X } from "lucide-react";
import type { PublicQuizQuestion, QuizAnswerSubmission } from "@/lib/quiz";
import type { CourseLessonWithProgress } from "@/lib/courseContent";
import type { RootKey } from "@/lib/music-theory";
import type { ScaleVariant } from "@/lib/scale-content";
import { cn } from "@/lib/utils";
import { QuizModal } from "@/components/progression/QuizModal";
import { toast } from "@/components/ui/Toaster";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/Card";
import { Hero } from "@/components/ui/Hero";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { WideLayout } from "@/components/layout/PageLayouts";
import { KeySelector } from "@/components/scales/KeySelector";
import { InstrumentStage, ScaleChart } from "@/components/scales/InstrumentStage";
import { ScaleChordsPanel } from "@/components/scales/ScaleChordsPanel";
import { useScalePlayer, useStopOnChange } from "@/components/scales/useScalePlayer";
import { useMetronome } from "@/components/scales/useMetronome";
import { LessonVideoPlayer } from "./LessonVideoPlayer";
import { SectionCompleteCelebration } from "./SectionCompleteCelebration";
import { FilesPanel, MetronomePanel, NotesPanel } from "./LessonTools";

// react-pdf/pdfjs-dist adds well over 100kB of first-load JS for a viewer
// most scale pages never open, so it loads on demand, only once a PDF lesson
// is actually shown. ssr: false because react-pdf needs a real DOM/canvas.
const LessonPdfPlayer = dynamic(() => import("./LessonPdfPlayer").then((m) => m.LessonPdfPlayer), {
  ssr: false,
  loading: () => (
    <div className="flex h-[60vh] w-full items-center justify-center rounded-control bg-slate-900 text-small text-slate-400">
      Loading PDF viewer…
    </div>
  ),
});

type Tool = "key" | "chart" | "chords" | "files" | "notes" | "metronome";
type Selection = { kind: "lesson"; index: number } | { kind: "assessment" } | { kind: "none" };

const TOOLS: { id: Tool; label: string; Icon: typeof KeyRound }[] = [
  { id: "key", label: "Key", Icon: KeyRound },
  { id: "chart", label: "Scale chart", Icon: Table2 },
  { id: "chords", label: "Chords", Icon: Layers },
  { id: "files", label: "Files", Icon: FileText },
  { id: "notes", label: "Notes", Icon: NotebookPen },
  { id: "metronome", label: "Metronome", Icon: Timer },
];

export interface ScaleWorkspaceProps {
  scaleSlug: string;
  scaleGroup: { code: string; title: string; kinitName: string | null; description: string | null };
  lessons: CourseLessonWithProgress[];
  quizQuestions: PublicQuizQuestion[];
  quizPassed: boolean;
  quizScore: number | null;
  quizPassThreshold: number;
  practiceCompleted: boolean;
  /**
   * Set only for a free-trial student. `lessons` then holds just the open
   * slice; the rest arrive as titles only (never file URLs) so locked
   * content can't be fished out of the page payload.
   */
  freeTrial: { endsAt: string; lockedLessonTitles: string[] } | null;
  variant: ScaleVariant | null;
  /** Per-lesson variants (by lesson title) that override `variant` while that lesson is open. */
  lessonVariants: Record<string, ScaleVariant>;
  instrument: PrimaryInstrument | null;
  initialNote: string;
  onMarkLessonComplete: (lessonId: string) => Promise<void>;
  onSubmitQuiz: (seed: number, answers: QuizAnswerSubmission[]) => Promise<{ passed: boolean; score: number; total: number }>;
  onMarkPracticeCompleted: () => Promise<void>;
  onSaveNote: (body: string) => Promise<{ ok: true; savedAt: string } | { ok: false; error: string }>;
}

// React 18's types don't know the `inert` attribute yet; it still reaches
// the DOM as a plain attribute. Hidden side columns are made inert so their
// controls can't be tabbed into while collapsed.
function inertWhen(on: boolean): Record<string, string> {
  return on ? { inert: "" } : {};
}

function useIsDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "";
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

/**
 * The lesson page (STEP 2B wireframe, approved 2026-10-02): one screen with
 * three zones instead of a section list that swapped to a separate lesson
 * view.
 * - Left: the outline, with progress checks. Collapsible on desktop, a
 *   bottom sheet on phones and tablets.
 * - Center: the lesson (video or PDF) with the instrument right under it.
 * - Right: a thin tool rail. A tool opens as a side panel and the center
 *   resizes to make room; on smaller screens the tools are a row of icons
 *   under the lesson that open as bottom sheets.
 *
 * Lesson rules are unchanged from the old player: lessons open one at a
 * time in order, "Mark as complete" is the only way to finish one, and the
 * final assessment opens once every lesson is done (never on a trial).
 *
 * STEP 2C: the current step's name is the Hero, the scale's name sits huge
 * and faint on the back plane, and the one green button is the step's main
 * action.
 */
export function ScaleWorkspace(props: ScaleWorkspaceProps) {
  const {
    scaleSlug,
    scaleGroup,
    lessons,
    quizQuestions,
    quizPassed,
    quizScore,
    quizPassThreshold,
    practiceCompleted,
    freeTrial,
    variant: groupVariant,
    lessonVariants,
    instrument,
    initialNote,
    onMarkLessonComplete,
    onSubmitQuiz,
    onMarkPracticeCompleted,
    onSaveNote,
  } = props;
  const router = useRouter();
  const isDesktop = useIsDesktop();

  const hasLessons = lessons.length > 0;
  const allLessonsComplete = hasLessons && lessons.every((l) => l.completed);
  const completedCount = lessons.filter((l) => l.completed).length;
  const assessmentUnlocked = !freeTrial && (!hasLessons || allLessonsComplete);
  const isLessonUnlocked = (index: number) => index === 0 || lessons[index - 1].completed;

  // Opens where the student left off: the first unfinished lesson, else the
  // assessment if it is open and not yet passed, else the first lesson.
  const [selection, setSelection] = useState<Selection>(() => {
    const next = lessons.findIndex((l) => !l.completed);
    if (next !== -1) return { kind: "lesson", index: next };
    if (assessmentUnlocked && !quizPassed) return { kind: "assessment" };
    return hasLessons ? { kind: "lesson", index: 0 } : { kind: "none" };
  });
  // The instrument follows the lesson that is open: Dorian's lesson shows
  // Dorian's formula, not the group's first (major) scale.
  const variant =
    (selection.kind === "lesson" ? lessonVariants[lessons[selection.index]?.title ?? ""] : undefined) ?? groupVariant;
  const [celebrating, setCelebrating] = useState<number | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [outlineSheet, setOutlineSheet] = useState(false);
  const [tool, setTool] = useState<Tool | null>(null);
  const [quizOpen, setQuizOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [markingPractice, setMarkingPractice] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // One player and one key for the whole page: there is a single pair of
  // speakers, so a chord and a scale run must be able to interrupt each
  // other, and the piano, chart, and chords must always agree on the key.
  const [root, setRoot] = useState<RootKey>("C");
  const [instrumentView, setInstrumentView] = useState(instrument);
  const player = useScalePlayer(instrumentView);
  useStopOnChange(player.stop, `${root}-${instrumentView}`);
  const metronome = useMetronome();

  function select(next: Selection) {
    setSelection(next);
    setCelebrating(null);
    setActionError(null);
    setOutlineSheet(false);
  }

  async function handleLessonComplete(index: number) {
    if (completing) return;
    setCompleting(true);
    setActionError(null);
    try {
      await onMarkLessonComplete(lessons[index].id);
      router.refresh();
      setCelebrating(index);
    } catch {
      // Never celebrate a completion the server didn't record.
      setActionError("That didn't save. Check your connection and try again.");
      toast.error("Couldn't save your progress", {
        description: "That lesson wasn't marked complete. Check your connection and try again.",
        action: { label: "Retry", onClick: () => handleLessonComplete(index) },
      });
    } finally {
      setCompleting(false);
    }
  }

  async function handleQuizSubmit(seed: number, answers: QuizAnswerSubmission[]) {
    const outcome = await onSubmitQuiz(seed, answers);
    if (outcome.passed) router.refresh();
    return outcome;
  }

  async function handlePractice() {
    setMarkingPractice(true);
    setActionError(null);
    try {
      await onMarkPracticeCompleted();
      router.refresh();
      toast.success("Practice logged", { description: `${scaleGroup.code}: ${scaleGroup.title}` });
    } catch {
      toast.error("Couldn't log that practice", { description: "Nothing was saved. Try again in a moment." });
    } finally {
      setMarkingPractice(false);
    }
  }

  const lesson = selection.kind === "lesson" ? lessons[selection.index] : null;
  const stepTotal = lessons.length + 1;
  const stepsDone = completedCount + (quizPassed ? 1 : 0);
  const heroText = lesson ? lesson.title : selection.kind === "assessment" ? "Final assessment" : scaleGroup.title;
  const stepLabel = lesson
    ? `${scaleGroup.code} · Lesson ${selection.kind === "lesson" ? selection.index + 1 : 1} of ${lessons.length}`
    : selection.kind === "assessment"
      ? `${scaleGroup.code} · Last step`
      : scaleGroup.code;

  /* ---------------------------------------------------------------- outline */
  const outline = (
    <nav aria-label="Lesson outline">
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>Outline</Eyebrow>
        {isDesktop && (
          <button
            type="button"
            onClick={() => setOutlineOpen(false)}
            aria-label="Hide outline"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-[rgb(var(--c-s-50)/0.06)] hover:text-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-3" role="progressbar" aria-valuenow={stepsDone} aria-valuemin={0} aria-valuemax={stepTotal} aria-label="Steps completed in this scale">
        <div className="flex gap-1" aria-hidden>
          {Array.from({ length: stepTotal }, (_, i) => (
            <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < stepsDone ? "bg-slate-50" : "bg-neu-base shadow-pressed-low")} />
          ))}
        </div>
        <p className="mt-2 text-small text-slate-400">
          {stepsDone} of {stepTotal} done
        </p>
      </div>

      <ol className="mt-4 space-y-1">
        {lessons.map((l, i) => {
          const unlocked = isLessonUnlocked(i);
          const active = selection.kind === "lesson" && selection.index === i;
          return (
            <li key={l.id}>
              <OutlineItem
                active={active}
                disabled={!unlocked}
                title={l.title}
                meta={[l.type === "VIDEO" ? "Video" : "PDF", formatDuration(l.durationSeconds)].filter(Boolean).join(" · ")}
                status={l.completed ? "done" : unlocked ? "open" : "locked"}
                lockedReason={!unlocked ? `Finish "${lessons[i - 1].title}" first.` : undefined}
                onClick={() => select({ kind: "lesson", index: i })}
              />
            </li>
          );
        })}
        {freeTrial?.lockedLessonTitles.map((title, i) => (
          <li key={`trial-${i}`}>
            <OutlineItem disabled title={title} meta="Included with a class plan" status="locked" lockedReason="Included with a live class plan." />
          </li>
        ))}
        <li>
          <OutlineItem
            active={selection.kind === "assessment"}
            disabled={!assessmentUnlocked && !quizPassed}
            title="Final assessment"
            meta={quizPassed && quizScore != null ? `Passed ${quizScore}/${quizQuestions.length}` : `${quizQuestions.length} questions`}
            status={quizPassed ? "done" : assessmentUnlocked ? "open" : "locked"}
            lockedReason={freeTrial ? "Included with a live class plan." : "Finish every lesson first."}
            onClick={() => select({ kind: "assessment" })}
          />
        </li>
      </ol>

      {!freeTrial && (
        <div className="mt-4 border-t border-ink/[0.08] pt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-small font-semibold text-slate-50">Practice</p>
              <p className="text-small text-slate-400">{practiceCompleted ? "Logged" : "Not logged yet"}</p>
            </div>
            {practiceCompleted ? (
              <Badge tone="success">Done</Badge>
            ) : (
              <Button variant="secondary" size="sm" loading={markingPractice} onClick={handlePractice}>
                Mark done
              </Button>
            )}
          </div>
        </div>
      )}

      {freeTrial && (
        <div className="mt-4 rounded-control border border-ink/10 p-3 text-small text-slate-300">
          <p>
            <span className="font-semibold text-slate-50">Free trial</span> until{" "}
            {new Date(freeTrial.endsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}. The first lessons
            are open; the rest come with live classes.
          </p>
          <Link href="/billing/plans" className="mt-2 inline-block font-semibold text-slate-50 underline underline-offset-4">
            See class plans
          </Link>
        </div>
      )}
    </nav>
  );

  /* ---------------------------------------------------------------- tools */
  const toolTitle = tool ? TOOLS.find((t) => t.id === tool)!.label : "";
  const toolBody: ReactNode =
    tool === "key" ? (
      <div>
        <p className="mb-3 text-small text-slate-400">Changes the key of the instrument, the scale chart, and the chords.</p>
        <KeySelector value={root} onChange={setRoot} />
      </div>
    ) : tool === "chart" ? (
      variant ? <ScaleChart variant={variant} root={root} player={player} /> : <NoScaleContent />
    ) : tool === "chords" ? (
      variant ? <ScaleChordsPanel variant={variant} root={root} player={player} /> : <NoScaleContent />
    ) : tool === "files" ? (
      <FilesPanel lessons={lessons} />
    ) : tool === "notes" ? (
      <NotesPanel initialBody={initialNote} onSave={onSaveNote} />
    ) : tool === "metronome" ? (
      <MetronomePanel metronome={metronome} />
    ) : null;

  function toolButton(t: (typeof TOOLS)[number], layout: "rail" | "row") {
    const active = tool === t.id;
    const ticking = t.id === "metronome" && metronome.running;
    return (
      <button
        key={t.id}
        type="button"
        onClick={() => setTool(active ? null : t.id)}
        aria-pressed={active}
        aria-label={t.id === "key" ? `Key: ${root}` : t.label}
        title={t.label}
        className={cn(
          "relative flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-control transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          layout === "rail" ? "h-14 w-14" : "h-14 min-w-14 flex-1 px-2",
          active ? "bg-[rgb(var(--signal)/0.14)] text-signal shadow-plane-front" : "text-slate-300 hover:bg-[rgb(var(--c-s-50)/0.06)] hover:text-slate-50",
        )}
      >
        <t.Icon className="h-5 w-5" aria-hidden />
        <span className="text-small leading-none">{t.id === "key" ? root : t.id === "chart" ? "Chart" : t.id === "metronome" ? "Tempo" : t.label}</span>
        {ticking && <span aria-hidden className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-slate-50 motion-safe:animate-pulse" />}
      </button>
    );
  }

  /* ---------------------------------------------------------------- center */
  const center = (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-3">
        <Link href="/dashboard" className="inline-flex min-h-11 items-center gap-1.5 text-small text-slate-400 transition-colors hover:text-slate-50">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Home
        </Link>
        <div className="flex items-center gap-2">
          {isDesktop && !outlineOpen && (
            <Button variant="ghost" size="sm" onClick={() => setOutlineOpen(true)}>
              <PanelLeftOpen className="h-4 w-4" aria-hidden /> Outline
            </Button>
          )}
          {!isDesktop && (
            <Button variant="secondary" size="sm" onClick={() => setOutlineSheet(true)}>
              <ListChecks className="h-4 w-4" aria-hidden /> Outline · {stepsDone}/{stepTotal}
            </Button>
          )}
        </div>
      </div>

      {/* Hero */}
      <div className="relative mt-2 pt-4 md:pt-6">
        <div className="relative z-(--z-mid)">
          <Eyebrow>{stepLabel}</Eyebrow>
          <Hero className="mt-2">{heroText}</Hero>
          {lesson?.completed && (
            <Badge tone="success" className="mt-3">
              Completed
            </Badge>
          )}
        </div>
      </div>

      {/* The lesson itself */}
      <div className="relative z-(--z-mid) mt-6">
        {celebrating !== null ? (
          <SectionCompleteCelebration
            hasNextSection={celebrating + 1 < lessons.length}
            onNextSection={() => select({ kind: "lesson", index: celebrating + 1 })}
            onCourseDetails={() => setCelebrating(null)}
          />
        ) : lesson ? (
          <Card
            padded={false}
            className={cn(
              "overflow-hidden p-2 md:p-3",
              // A 16:9 video at full column width would push the step's
              // actions and the instrument off the first screen; capping its
              // width by the viewport height keeps them in view.
              lesson.type === "VIDEO" && "mx-auto lg:max-w-[calc(52svh*16/9)]",
            )}
          >
            {lesson.type === "VIDEO" ? (
              <LessonVideoPlayer src={lesson.fileUrl} title={lesson.title} subtitle={`${scaleGroup.code}: ${scaleGroup.title}`} />
            ) : (
              <LessonPdfPlayer src={lesson.fileUrl} title={lesson.title} />
            )}
          </Card>
        ) : selection.kind === "assessment" ? (
          <Card>
            <p className="max-w-[60ch] text-body text-slate-200">
              {quizQuestions.length} questions on spelling and recognizing {scaleGroup.title}. Pass with {Math.round(quizPassThreshold * 100)}% or
              more to complete the scale.
            </p>
            {quizPassed && quizScore != null && (
              <Badge tone="success" className="mt-4">
                Passed {quizScore}/{quizQuestions.length}
              </Badge>
            )}
            <div className="mt-5">
              {assessmentUnlocked ? (
                <Button variant={quizPassed ? "secondary" : "default"} onClick={() => setQuizOpen(true)}>
                  {quizPassed ? "Take it again" : "Start the assessment"}
                </Button>
              ) : (
                <p className="text-small text-slate-400">{freeTrial ? "Included with a live class plan." : "Finish every lesson to unlock it."}</p>
              )}
            </div>
          </Card>
        ) : (
          <EmptyState title="Lessons are on their way" description="Content for this scale is coming soon. The instrument and tools below already work." />
        )}
      </div>

      {/* Step actions: the one green button is the step's main action. */}
      {lesson && celebrating === null && selection.kind === "lesson" && (
        <div className={cn("mt-4", lesson.type === "VIDEO" && "mx-auto lg:max-w-[calc(52svh*16/9)]")}>
          {actionError && (
            <p role="alert" className="mb-3 text-small text-[rgb(var(--c-rd-300))]">
              {actionError}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={selection.index === 0}
                onClick={() => select({ kind: "lesson", index: selection.index - 1 })}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                disabled={!(selection.index + 1 < lessons.length && lesson.completed)}
                onClick={() => select({ kind: "lesson", index: selection.index + 1 })}
              >
                Next
              </Button>
            </div>
            {lesson.completed ? (
              allLessonsComplete && !quizPassed && assessmentUnlocked ? (
                <Button onClick={() => select({ kind: "assessment" })}>Go to the final assessment</Button>
              ) : null
            ) : (
              <Button loading={completing} onClick={() => handleLessonComplete(selection.index)}>
                {completing ? "Saving…" : "Mark as complete"}
                {!completing && <Check className="h-4 w-4" aria-hidden />}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* The instrument, right under the lesson */}
      {variant && (
        <Card className="mt-6">
          <InstrumentStage
            variant={variant}
            root={root}
            player={player}
            instrument={instrumentView}
            onInstrumentChange={setInstrumentView}
          />
        </Card>
      )}

      {/* Tools as a row of icons on phones and tablets */}
      {!isDesktop && (
        <div className="mt-4 flex gap-1 overflow-x-auto rounded-card border border-ink/[0.08] bg-[rgb(var(--plane-mid-bg))] p-1 shadow-plane-mid" role="toolbar" aria-label="Lesson tools">
          {TOOLS.map((t) => toolButton(t, "row"))}
        </div>
      )}
    </div>
  );

  /* ---------------------------------------------------------------- layout */
  return (
    <WideLayout className="pb-(--space-section)">
      {isDesktop ? (
        <div
          className="grid items-start transition-[grid-template-columns] duration-(--dur-slow) ease-(--ease-ios) motion-reduce:transition-none"
          style={{
            gridTemplateColumns: `${outlineOpen ? "17.5rem" : "0rem"} minmax(0,1fr) ${tool ? "23rem" : "0rem"} 4.5rem`,
          }}
        >
          <aside className="sticky top-0 overflow-hidden" aria-hidden={!outlineOpen} {...inertWhen(!outlineOpen)}>
            <div className="max-h-[calc(100svh-9rem)] w-[17.5rem] overflow-y-auto pr-6">
              <Card>{outline}</Card>
            </div>
          </aside>

          {center}

          <aside className="sticky top-0 overflow-hidden" aria-label={tool ? `${toolTitle} tool` : undefined} {...inertWhen(!tool)}>
            <div className="max-h-[calc(100svh-9rem)] w-[23rem] overflow-y-auto pl-6">
              <Card>
                <div className="flex items-center justify-between gap-3">
                  <Eyebrow>{toolTitle}</Eyebrow>
                  <button
                    type="button"
                    onClick={() => setTool(null)}
                    aria-label={`Close ${toolTitle}`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-[rgb(var(--c-s-50)/0.06)] hover:text-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-4">{toolBody}</div>
              </Card>
            </div>
          </aside>

          <div className="sticky top-0 pl-4" role="toolbar" aria-label="Lesson tools" aria-orientation="vertical">
            <div className="flex flex-col items-center gap-1 rounded-card border border-ink/[0.08] bg-[rgb(var(--plane-mid-bg))] p-1 shadow-plane-mid">
              {TOOLS.map((t) => toolButton(t, "rail"))}
            </div>
          </div>
        </div>
      ) : (
        center
      )}

      {!isDesktop && (
        <>
          <Dialog open={outlineSheet} onOpenChange={setOutlineSheet} title={scaleGroup.title} description={`${stepsDone} of ${stepTotal} done`}>
            {outline}
          </Dialog>
          <Dialog open={tool !== null} onOpenChange={(open) => !open && setTool(null)} title={toolTitle}>
            {toolBody}
          </Dialog>
        </>
      )}

      <QuizModal
        isOpen={quizOpen}
        onClose={() => setQuizOpen(false)}
        scaleTitle={scaleGroup.title}
        scaleSlug={scaleSlug}
        onSubmit={handleQuizSubmit}
        passThreshold={quizPassThreshold}
      />
    </WideLayout>
  );
}

function NoScaleContent() {
  return <p className="text-small text-slate-400">Interactive content for this scale is coming soon.</p>;
}

function OutlineItem({
  title,
  meta,
  status,
  active = false,
  disabled = false,
  lockedReason,
  onClick,
}: {
  title: string;
  meta?: string;
  status: "done" | "open" | "locked";
  active?: boolean;
  disabled?: boolean;
  lockedReason?: string;
  onClick?: () => void;
}) {
  const StatusIcon = status === "done" ? Check : status === "locked" ? Lock : Circle;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? "step" : undefined}
      title={disabled ? lockedReason : undefined}
      className={cn(
        "flex min-h-11 w-full items-start gap-3 rounded-control px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
        active ? "bg-[rgb(var(--signal)/0.1)] shadow-[inset_3px_0_0_rgb(var(--signal))]" : "hover:bg-[rgb(var(--c-s-50)/0.05)] disabled:hover:bg-transparent",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
          status === "done" ? "bg-slate-50 text-slate-950" : status === "locked" ? "text-slate-500" : "border border-slate-500 text-transparent",
        )}
        aria-hidden
      >
        <StatusIcon className="h-3 w-3" strokeWidth={3} />
      </span>
      <span className="min-w-0">
        <span className={cn("block text-small font-semibold", active ? "text-signal" : disabled ? "text-slate-500" : "text-slate-50")}>{title}</span>
        {meta && <span className="block text-small text-slate-400">{meta}</span>}
        {disabled && lockedReason && <span className="sr-only">{lockedReason}</span>}
      </span>
    </button>
  );
}

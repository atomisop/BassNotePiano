import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { getRoadmap } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { getUserClassBookings } from "@/lib/classSchedule";
import { resolveNextStep, summariseProgress } from "@/lib/next-step";
import { ScaleRoadmap } from "@/components/progression/ScaleRoadmap";
import { BadgeSummary } from "@/components/gamification/BadgeSummary";
import { TodayGreeting } from "@/components/dashboard/TodayGreeting";
import { ProgressRing } from "@/components/ui/ProgressRing";

function ArrowIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** One figure + its label. Deliberately plain — the numbers do the work. */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-serif text-2xl tabular-nums text-slate-50">{value}</p>
      <p className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/dashboard");

  const [roadmap, badgeCount, user, bookings] = await Promise.all([
    getRoadmap(session.user.id),
    prisma.userBadge.count({ where: { userId: session.user.id } }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, currentStreak: true, classCredits: true },
    }),
    getUserClassBookings(session.user.id),
  ]);

  const progress = summariseProgress(roadmap);
  const nextStep = resolveNextStep(roadmap);

  // getUserClassBookings returns newest-first across all statuses; the next
  // class is the earliest still-scheduled one in the future.
  const now = Date.now();
  const nextClass = bookings
    .filter((b) => b.status === "SCHEDULED" && b.scheduledAt.getTime() > now)
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())[0];

  const streak = user?.currentStreak ?? 0;

  return (
    <div className="mx-auto max-w-5xl">
      <TodayGreeting name={user?.name ?? null} />
      {progress.completedScales > 0 && (
        <p className="mt-2 text-sm text-slate-500">
          {progress.completedScales} of {progress.totalScales} scale groups complete.
        </p>
      )}

      {/* ---- The one thing to do next ------------------------------------
          The single `.glass-surface-elevated` on this screen, per the design
          system: elevation here means "this is the answer to why you opened
          the page", so nothing else on it may compete. `relative isolate
          overflow-hidden` plus the glow div right after are new: this is the
          dashboard's own hero card, so it gets the same gradient-accent
          treatment as the marketing Hero — `isolate` contains the glow's
          negative z-index to this card alone rather than the nearest
          ancestor stacking context, so it can never paint behind unrelated
          content elsewhere on the page. */}
      <div className="glass-surface-elevated relative isolate mt-7 overflow-hidden p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 -z-10 h-56 w-56 rounded-full"
          style={{
            background: "radial-gradient(closest-side, rgb(var(--c-a-400) / 0.18), transparent)",
            filter: "blur(8px)",
          }}
        />
        <p className="eyebrow">Your next step</p>
        <h2 className="mt-2 font-serif text-2xl text-slate-50 sm:text-3xl">{nextStep.action}</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">{nextStep.detail}</p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href={nextStep.href}
            className="cta-sheen cta-fill inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold"
          >
            {nextStep.cta}
            <ArrowIcon />
          </Link>
          {nextStep.scale && nextStep.kind !== "buy-curriculum" && (
            <span className="text-xs text-slate-500">
              {nextStep.scale.scaleGroup.code} · {nextStep.scale.scaleGroup.title}
            </span>
          )}
        </div>
      </div>

      {/* ---- Where you stand ---------------------------------------------
          One card with divided cells rather than four floating stat cards —
          four identically-shadowed panels read as four equally urgent things. */}
      <div className="glass-surface mt-6 flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
        {/* The ring carries the single "how far in am I" figure; the four
            stats beside it are the specifics. One number to glance at, four
            to read. */}
        <div className="flex shrink-0 justify-center sm:justify-start">
          <ProgressRing
            value={progress.itemsDone}
            max={progress.itemsTotal}
            size={92}
            strokeWidth={7}
            label={`Curriculum progress: ${progress.itemsDone} of ${progress.itemsTotal} checklist items complete`}
            caption={`${progress.itemsDone}/${progress.itemsTotal} steps`}
            tone={progress.itemsDone === progress.itemsTotal ? "success" : "accent"}
          />
        </div>

        <div className="grid flex-1 grid-cols-2 gap-y-6 sm:grid-cols-4">
          <Stat value={`${progress.completedScales}/${progress.totalScales}`} label="Scales done" />
          <Stat value={`${streak}`} label="Day streak" />
          <Stat value={`${badgeCount}`} label="Badges" />
          <Stat value={`${user?.classCredits ?? 0}`} label="Class credits" />
        </div>
      </div>

      {/* ---- Next class, only when one actually exists -------------------- */}
      {nextClass && (
        <Link
          href="/lessons"
          className="glass-surface mt-6 flex items-center justify-between gap-4 p-5 transition hover:border-[rgb(var(--c-s-50)/0.4)]"
        >
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Next live class</p>
            <p className="mt-1 font-serif text-lg text-slate-50">
              {/* Rendered in the server's locale as a stable, unambiguous
                  format — the exact local time is shown on /lessons, which
                  already converts client-side. */}
              {nextClass.scheduledAt.toLocaleString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZone: "America/New_York",
                timeZoneName: "short",
              })}
            </p>
            {nextClass.schedule.label && (
              <p className="mt-0.5 text-sm text-slate-500">{nextClass.schedule.label}</p>
            )}
          </div>
          <span className="shrink-0 text-[rgb(var(--c-s-50))]">
            <ArrowIcon />
          </span>
        </Link>
      )}

      <div className="mt-6">
        <BadgeSummary earnedCount={badgeCount} currentStreak={streak} />
      </div>

      <div className="mt-10">
        <p className="eyebrow">The path</p>
        <h2 className="mt-1.5 font-serif text-2xl text-slate-50">
          Your route through the whole system
        </h2>
        <div className="mt-6">
          <ScaleRoadmap roadmap={roadmap} />
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { getRoadmap } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { BADGES } from "@/lib/badges";
import { getUserClassBookings } from "@/lib/classSchedule";
import { resolveNextStep, summariseProgress } from "@/lib/next-step";
import { cn } from "@/lib/utils";
import { ScaleRoadmap } from "@/components/progression/ScaleRoadmap";
import { StreakDots } from "@/components/gamification/StreakDots";
import { TodayGreeting } from "@/components/dashboard/TodayGreeting";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Card, Eyebrow } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/button";
import { WideLayout } from "@/components/layout/PageLayouts";

function ArrowIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** One figure and its label. Figures stay small: the Hero is the greeting. */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-body font-semibold tabular-nums text-slate-50">{value}</p>
      <p className="text-small text-slate-400">{label}</p>
    </div>
  );
}

/**
 * Home (STEP 2B wireframe, approved 2026-10-02).
 *
 * Desktop: a wide main column (greeting, next step, learning tabs) and a
 * right panel for the week, progress, next class, and badges, so the next
 * step, the stats, and the first row of scales all fit on the first screen.
 * Below lg the panel drops in right after the next-step card.
 *
 * STEP 2C: the greeting is the one Hero; the student's progress ("3/14")
 * sits huge and faint behind it on the back plane; Continue is the one
 * green button.
 */
export default async function DashboardPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/dashboard");

  const [roadmap, badgeRows, user, bookings] = await Promise.all([
    getRoadmap(session.user.id),
    prisma.userBadge.findMany({ where: { userId: session.user.id }, select: { code: true } }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, currentStreak: true, classCredits: true },
    }),
    getUserClassBookings(session.user.id),
  ]);

  const progress = summariseProgress(roadmap);
  const nextStep = resolveNextStep(roadmap);
  const earnedBadgeCodes = badgeRows.map((b) => b.code);

  // getUserClassBookings returns newest-first across all statuses; the next
  // class is the earliest still-scheduled one in the future.
  const now = Date.now();
  const nextClass = bookings
    .filter((b) => b.status === "SCHEDULED" && b.scheduledAt.getTime() > now)
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())[0];

  const streak = user?.currentStreak ?? 0;

  return (
    <WideLayout>
      <div className="grid gap-x-(--space-section) gap-y-(--space-group) lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_auto_1fr] xl:grid-cols-[minmax(0,1fr)_22rem]">
        {/* ---- Hero -------------------------------------------------------- */}
        <div className="relative pt-4 md:pt-6 lg:col-start-1">
          <TodayGreeting name={user?.name ?? null} className="relative z-(--z-mid)" />
        </div>

        {/* ---- The one thing to do next ------------------------------------ */}
        <Card className="relative z-(--z-mid) lg:col-start-1">
          <Eyebrow>Your next step</Eyebrow>
          <p className="mt-2 text-body font-semibold text-slate-50">{nextStep.action}</p>
          <p className="mt-1 max-w-[60ch] text-small text-slate-400">{nextStep.detail}</p>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link href={nextStep.href} className={cn(buttonVariants(), "relative z-(--z-front)")}>
              {nextStep.cta}
              <ArrowIcon />
            </Link>
            {nextStep.scale && nextStep.kind !== "buy-curriculum" && (
              <span className="text-small text-slate-400">
                {nextStep.scale.scaleGroup.code} · {nextStep.scale.scaleGroup.title}
              </span>
            )}
          </div>
        </Card>

        {/* ---- Right panel (below the next step on smaller screens) -------- */}
        <aside
          aria-label="Your week and progress"
          className="grid gap-3 sm:grid-cols-2 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:grid-cols-1 lg:content-start"
        >
          <Card>
            <Eyebrow>This week</Eyebrow>
            <StreakDots currentStreak={streak} />
            <p className="mt-3 text-small text-slate-400">
              {streak > 0 ? `${streak} day streak` : "Practice today to start a streak"}
            </p>
          </Card>

          <Card>
            <Eyebrow>Progress</Eyebrow>
            <div className="mt-3 flex items-center gap-5">
              <ProgressRing
                value={progress.itemsDone}
                max={progress.itemsTotal}
                size={84}
                strokeWidth={7}
                label={`Curriculum progress: ${progress.itemsDone} of ${progress.itemsTotal} checklist items complete`}
                caption={`${progress.itemsDone}/${progress.itemsTotal} steps`}
              />
              <div className="grid flex-1 grid-cols-2 gap-x-3 gap-y-3">
                <Stat value={`${progress.completedScales}/${progress.totalScales}`} label="Scales" />
                <Stat value={`${earnedBadgeCodes.length}`} label="Badges" />
                <Stat value={`${streak}`} label="Day streak" />
                <Stat value={`${user?.classCredits ?? 0}`} label="Credits" />
              </div>
            </div>
          </Card>

          {nextClass ? (
            <Link
              href="/lessons"
              className="group rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card interactive className="flex items-center justify-between gap-4">
                <div>
                  <Eyebrow>Next live class</Eyebrow>
                  <p className="mt-2 text-small font-semibold text-slate-50">
                    {/* Server-rendered in one stable time zone; /lessons shows
                        the student's own local time. */}
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
                  {nextClass.schedule.label && <p className="text-small text-slate-400">{nextClass.schedule.label}</p>}
                </div>
                <span className="shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5">
                  <ArrowIcon />
                </span>
              </Card>
            </Link>
          ) : (
            <Card>
              <Eyebrow>Live classes</Eyebrow>
              <p className="mt-2 text-small text-slate-400">No class booked yet.</p>
              <Link
                href="/lessons"
                className="mt-2 inline-flex text-small font-semibold text-slate-50 underline-offset-4 hover:underline"
              >
                Book a class
              </Link>
            </Card>
          )}

          <Card>
            <Eyebrow>Badges</Eyebrow>
            <p className="mt-2 text-small text-slate-50">
              {earnedBadgeCodes.length} of {BADGES.length} earned
            </p>
            <Link
              href="/profile"
              className="mt-1 inline-flex text-small font-semibold text-slate-300 underline-offset-4 hover:text-slate-50 hover:underline"
            >
              See them on your profile
            </Link>
          </Card>
        </aside>

        {/* ---- The path: tabs + scale grid --------------------------------- */}
        <div className="lg:col-start-1">
          <ScaleRoadmap roadmap={roadmap} earnedBadgeCodes={earnedBadgeCodes} />
        </div>
      </div>
    </WideLayout>
  );
}

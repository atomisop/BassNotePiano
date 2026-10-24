import { formatCredits, storedToCredits } from "@/lib/classCreditPricing";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { getRoadmap } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { BADGES } from "@/lib/badges";
import { DAILY_GOAL_SECONDS, getFingerPracticeStatus } from "@/lib/fingerPractice";
import { putFingerPracticeFirst, resolveNextStep, summariseProgress, type NextStep } from "@/lib/next-step";
import { gettingStartedStep } from "@/lib/lockedScale";
import { getCurriculumEntitlement } from "@/lib/entitlement";
import { cn } from "@/lib/utils";
import { ScaleRoadmap } from "@/components/progression/ScaleRoadmap";
import { cookies } from "next/headers";
import { SCALE_VIEW_COOKIE, parseScaleView } from "@/lib/scaleView";
import { StreakDots } from "@/components/gamification/StreakDots";
import { TodayGreeting } from "@/components/dashboard/TodayGreeting";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Card, Eyebrow } from "@/components/ui/Card";
import { CardDeck } from "@/components/ui/CardDeck";
import { buttonVariants } from "@/components/ui/button";
import { getBoolSetting, getNumberSetting } from "@/lib/siteSettings";
import { TeacherNotesCard } from "@/components/dashboard/TeacherNotesCard";
import { WideLayout } from "@/components/layout/PageLayouts";
import { formatEtDateTime } from "@/lib/classScheduleLabels";
import { DISCORD_INVITE_URL, discordChannelUrl } from "@/lib/discord";
import { CLASS_MINUTES, CREDITS_PER_CLASS } from "@/lib/classCreditPricing";
import { DiscordLink } from "@/components/ui/DiscordLink";

function ArrowIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** "in 3 days", "tomorrow", "in 2 hours", "starting now". */
function untilLabel(when: Date): string {
  const minutes = Math.round((when.getTime() - Date.now()) / 60_000);
  if (minutes <= 0) return "starting now";
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return days === 1 ? "tomorrow" : `in ${days} days`;
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
 * Desktop: the full width. A band of cards (finger practice, next class, next
 * step, week, progress) sits on the same four columns as the scales below it.
 * Below md (phones) the cards become one swipeable deck (CardDeck); tablets get two columns.
 *
 * STEP 2C: the greeting is the one Hero; the student's progress ("3/14")
 * sits huge and faint behind it on the back plane; Continue is the one
 * green button.
 */
export const metadata = { title: "Home" };

export default async function DashboardPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/dashboard");

  const [roadmap, badgeRows, user, practice, nextClass, entitlement, pendingApplication, everBooked, everPracticed] = await Promise.all([
    getRoadmap(session.user.id),
    prisma.userBadge.findMany({ where: { userId: session.user.id }, select: { code: true } }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, currentStreak: true, classCredits: true, discordId: true },
    }),
    getFingerPracticeStatus(session.user.id),
    // Still counts for an hour after it starts, so "Join" is there if they are a little late.
    prisma.classBooking.findFirst({
      where: { studentId: session.user.id, status: "SCHEDULED", scheduledAt: { gt: new Date(Date.now() - 60 * 60_000) } },
      orderBy: { scheduledAt: "asc" },
      select: { scheduledAt: true, creditsSpent: true, discordChannelId: true, inPerson: true },
    }),
    getCurriculumEntitlement(session.user.id),
    // An application from this account, or from this email before the account existed.
    prisma.classRegistration.count({
      where: {
        status: "PENDING",
        OR: [{ userId: session.user.id }, { email: { equals: session.user.email ?? "", mode: "insensitive" } }],
      },
    }),
    prisma.classBooking.count({ where: { studentId: session.user.id } }),
    prisma.fingerPracticeDay.count({ where: { userId: session.user.id, completedAt: { not: null } } }),
  ]);

  const progress = summariseProgress(roadmap);
  const trialDays = (await getBoolSetting("trial.enabled")) ? await getNumberSetting("trial.days") : 0;
  const starting = gettingStartedStep({ kind: entitlement.kind, applicationPending: pendingApplication > 0, trialDays });
  const resolvedStep = resolveNextStep(roadmap);
  const nextStep: NextStep = starting ? { ...resolvedStep, ...starting } : putFingerPracticeFirst(resolvedStep, {
    required: session.user.role !== "ADMIN",
    completedToday: practice.completedToday,
    minutesLeft: Math.max(0, Math.ceil((DAILY_GOAL_SECONDS - practice.todaySeconds) / 60)),
  });
  const earnedBadgeCodes = badgeRows.map((b) => b.code);

  const streak = user?.currentStreak ?? 0;

  // Each card is a function, called once per place it renders (never reuse one
  // element twice: a streamed <Suspense> reused in two spots fails to hydrate): the phone deck below
  // `lg`, and the normal layout from `lg` up (the other copy is display:none).
  // First-week checklist: three things that make the app work for a new student. Each ticks itself when the real thing happens,
  // and the whole card disappears once all three are done (or for the admin, who has no classes of their own to set up).
  const gettingStarted = [
    { done: Boolean(user?.discordId), label: "Link your Discord", detail: "Your live class call opens there.", href: "/api/discord/connect", external: true },
    { done: everBooked > 0, label: "Book your first class", detail: "Pick a time that repeats every week.", href: "/lessons", external: false },
    { done: everPracticed > 0, label: "Do your first 10 minutes of practice", detail: "It also opens your scales.", href: "/practice", external: false },
  ];
  const showGettingStarted = session.user.role !== "ADMIN" && entitlement.kind !== "NONE" && gettingStarted.some((g) => !g.done);
  const gettingStartedCard = () => (
    <Card className="relative z-(--z-mid)">
      <Eyebrow>
        Get started · {gettingStarted.filter((g) => g.done).length} of {gettingStarted.length}
      </Eyebrow>
      <ul className="mt-3 grid gap-1">
        {gettingStarted.map((g) => {
          const row = (
            <>
              <span
                aria-hidden
                className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", g.done ? "bg-signal text-slate-950" : "bg-neu-base text-transparent shadow-pressed-low")}
              >
                ✓
              </span>
              <span className="min-w-0">
                <span className={cn("block text-body font-semibold", g.done ? "text-slate-500 line-through" : "text-slate-50")}>
                  {g.label}
                  <span className="sr-only">{g.done ? " (done)" : " (not done yet)"}</span>
                </span>
                {!g.done && <span className="block text-small text-slate-400">{g.detail}</span>}
              </span>
            </>
          );
          const cls = "tap flex items-center gap-3 rounded-control py-1.5";
          if (g.done) return <li key={g.label} className={cls}>{row}</li>;
          return (
            <li key={g.label}>
              {g.external ? (
                <a href={g.href} className={cn(cls, "hover:bg-slate-800/40")}>{row}</a>
              ) : (
                <Link href={g.href} className={cn(cls, "hover:bg-slate-800/40")}>{row}</Link>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );

  const nextStepCard = () => (
    <Card className="relative z-(--z-mid)">
      <Eyebrow>Your next step</Eyebrow>
      <p className="mt-2 text-body font-semibold text-slate-50">{nextStep.action}</p>
      <p className="mt-1 max-w-[60ch] text-small text-slate-400">{nextStep.detail}</p>
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href={nextStep.href} className={cn(buttonVariants(), "relative z-(--z-front)")}>
          {nextStep.cta}
          <ArrowIcon />
        </Link>
        {nextStep.secondary && (
          <Link href={nextStep.secondary.href} className="tap inline-flex items-center text-small font-semibold text-slate-300 underline-offset-4 hover:text-slate-50 hover:underline">
            {nextStep.secondary.cta}
          </Link>
        )}
        {nextStep.scale && nextStep.kind !== "buy-curriculum" && (
          <span className="text-small text-slate-400">
            {nextStep.scale.scaleGroup.code} · {nextStep.scale.scaleGroup.title}
          </span>
        )}
      </div>
    </Card>
  );

  const nextClassCard = () => {
    const minutesAway = nextClass ? (nextClass.scheduledAt.getTime() - Date.now()) / 60_000 : 0;
    const canJoin = nextClass !== null && !nextClass.inPerson && minutesAway <= 30;
    const length = nextClass ? Math.round((nextClass.creditsSpent / CREDITS_PER_CLASS) * CLASS_MINUTES) : CLASS_MINUTES;
    return (
      <Card className="relative z-(--z-mid)">
        <Eyebrow>Next class</Eyebrow>
        {nextClass ? (
          <>
            <p className="mt-2 text-body font-semibold text-slate-50">{formatEtDateTime(nextClass.scheduledAt)}</p>
            <p className="mt-1 text-small text-slate-400">{untilLabel(nextClass.scheduledAt)}{nextClass.inPerson ? " · In person, no Discord call" : ""}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {canJoin && (
                <DiscordLink
                  href={nextClass.discordChannelId ? discordChannelUrl(nextClass.discordChannelId) : DISCORD_INVITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonVariants(), "relative z-(--z-front)")}
                >
                  Join on Discord
                  <ArrowIcon />
                </DiscordLink>
              )}
              <a
                href={`/api/calendar/class?s=${encodeURIComponent(nextClass.scheduledAt.toISOString())}&m=${length}`}
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                Add to calendar
              </a>
              <Link href="/lessons" className="tap inline-flex items-center text-small font-semibold text-slate-300 underline-offset-4 hover:text-slate-50 hover:underline">
                My classes
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-body font-semibold text-slate-50">No class booked</p>
            <Link href="/lessons" className={cn(buttonVariants(), "relative z-(--z-front) mt-4")}>
              Book a class
              <ArrowIcon />
            </Link>
          </>
        )}
      </Card>
    );
  };

  const weekCard = () => (
    <Card>
      <Eyebrow>This week</Eyebrow>
      <StreakDots currentStreak={streak} />
      <p className="mt-3 text-small text-slate-400">
        {streak > 0 ? `${streak} day streak` : "Practice today to start a streak"}
      </p>
    </Card>
  );

  const progressCard = () => (
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
          <Stat value={formatCredits(storedToCredits(user?.classCredits ?? 0))} label="Credits" />
        </div>
      </div>
    </Card>
  );

  const practiceCard = () => (
    <Card className="relative z-(--z-mid)">
      <Eyebrow>Finger practice</Eyebrow>
      <p className="mt-2 text-body font-semibold text-slate-50">
        {practice.completedToday ? "Done for today" : "10 minutes to unlock your scales"}
      </p>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-neu-base shadow-pressed-low"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={DAILY_GOAL_SECONDS}
        aria-valuenow={practice.todaySeconds}
        aria-label="Finger practice today"
      >
        <div className="h-full rounded-full bg-[rgb(var(--signal))] transition-all" style={{ width: `${Math.round((practice.todaySeconds / DAILY_GOAL_SECONDS) * 100)}%` }} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href="/practice" className={cn(buttonVariants(), "relative z-(--z-front)")}>
          {practice.completedToday ? "Practice more" : practice.todaySeconds > 0 ? "Continue" : "Start practice"}
          <ArrowIcon />
        </Link>
        <span className="text-small text-slate-400">
          {practice.streak} day streak
        </span>
      </div>
    </Card>
  );

  const badgesCard = () => (
    <Card>
      <Eyebrow>Badges</Eyebrow>
      <p className="mt-2 text-small text-slate-50">
        {earnedBadgeCodes.length} of {BADGES.length} earned
      </p>
      <Link
        href="/profile"
        className="tap mt-1 inline-flex items-center text-small font-semibold text-slate-300 underline-offset-4 hover:text-slate-50 hover:underline"
      >
        See them on your profile
      </Link>
    </Card>
  );

  return (
    <WideLayout>
      {/* grid-cols-1, not an automatic column: an automatic one grows to its widest unbreakable content, and the one-line scale titles in List view made the whole page wider than the phone. */}
      <div className="grid grid-cols-1 gap-y-(--space-group)">
        {/* ---- Hero -------------------------------------------------------- */}
        <div className="relative pt-4 md:pt-6">
          <TodayGreeting name={user?.name ?? null} className="relative z-(--z-mid)" />
        </div>

        {/* ---- Phones: the cards as one swipeable deck. Finger practice is
            first: it is the thing to do today, and it unlocks the scales. --- */}
        <CardDeck
          className="md:hidden"
          label="Your home cards"
          labels={[...(showGettingStarted ? ["Get started"] : []), "Your next step", "Finger practice", "Next class", "This week", "Progress", "Badges"]}
        >
          {showGettingStarted && gettingStartedCard()}
          {nextStepCard()}
          {practiceCard()}
          {nextClassCard()}
          {weekCard()}
          {progressCard()}
          {badgesCard()}
        </CardDeck>

        {/* ---- Desktop: one band of cards, on the same four columns as the
            scales below. The next step is only as wide as it needs to be, and
            the week and progress cards take the space it used to leave empty,
            so there is no side column and the scales get the full width. ---- */}
        <div className="hidden gap-3 md:grid md:grid-cols-2 lg:grid-cols-4 [&>*>*]:h-full">
          {showGettingStarted && <div className="md:col-span-2 lg:col-span-4">{gettingStartedCard()}</div>}
          <div className="md:col-span-2 lg:col-span-4">{nextStepCard()}</div>
          <div className="lg:col-span-2">{practiceCard()}</div>
          <div className="lg:col-span-2">{nextClassCard()}</div>
          <div>{weekCard()}</div>
          <div>{progressCard()}</div>
        </div>

        <TeacherNotesCard studentId={session.user.id} />

        {/* ---- The path: tabs + scale grid --------------------------------- */}
        <div>
          <h2 className="sr-only">Your scales</h2>
          <ScaleRoadmap roadmap={roadmap} earnedBadgeCodes={earnedBadgeCodes} initialView={parseScaleView((await cookies()).get(SCALE_VIEW_COOKIE)?.value) ?? "grid"} />
        </div>
      </div>
    </WideLayout>
  );
}

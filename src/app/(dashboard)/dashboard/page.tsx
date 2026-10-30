import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Check, Flame, Lightbulb, Map, Medal, Trophy, Users, Video } from "@/components/ui/appIcons";
import { getServerAuthSession } from "@/lib/auth";
import { getHomeData } from "@/lib/homeData";
import { getWeeklyLeaderboard } from "@/lib/leaderboard";
import { topWithMe } from "@/lib/leaderboardRules";
import { LeaderboardRows } from "@/components/home/LeaderboardRows";
import { DAILY_GOAL_SECONDS } from "@/lib/fingerPractice";
import { WEEKLY_GOAL_MINUTES } from "@/lib/homeRules";
import { formatEtDateTime } from "@/lib/classScheduleLabels";
import { CLASS_MINUTES, CREDITS_PER_CLASS, formatCredits } from "@/lib/classCreditPricing";
import { TeacherNotesCard } from "@/components/dashboard/TeacherNotesCard";
import { DISCORD_INVITE_URL, discordChannelUrl } from "@/lib/discord";
import { cn } from "@/lib/utils";
import { WideLayout } from "@/components/layout/PageLayouts";
import { TodayGreeting } from "@/components/dashboard/TodayGreeting";
import { Eyebrow } from "@/components/ui/Card";
import { ColorCard } from "@/components/home/ColorCard";
import { buttonVariants } from "@/components/ui/button";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { DiscordLink } from "@/components/ui/DiscordLink";
import { RoadmapCard } from "@/components/home/RoadmapCard";
import { CelebrationCard } from "@/components/home/CelebrationCard";
import { BadgeGrid } from "@/components/gamification/BadgeGrid";
import { BADGES } from "@/lib/badges";

export const metadata = { title: "Home" };

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

/**
 * Home: a welcome and the one thing to do today. A new account (no plan, no trial) gets the free trial class and how the studio
 * works; a student gets today's step, their roadmap, the next class, practice, a tip and their friends. The course itself lives on
 * the Roadmap screen (/roadmap). Design: docs/superpowers/specs/2026-10-29-new-home-and-roadmaps-design.md.
 */
export default async function HomePage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/dashboard");
  const data = await getHomeData({ id: session.user.id, role: session.user.role, email: session.user.email ?? null });

  // On phones and tablets the greeting stays put under the top bar and the card deck stacks just below it (DeckStack).
  const greeting = (
    <div data-deck-header className="deck-header pt-4 md:pt-6">
      <TodayGreeting name={data.name} />
    </div>
  );

  if (data.isNew) {
    return (
      <WideLayout>
        <div className="grid grid-cols-1 gap-3 md:max-w-3xl">
          {greeting}
          <ColorCard color="sunset" className="p-5 md:p-7">
            <Eyebrow>Start here</Eyebrow>
            <p className="mt-2 text-headline font-bold leading-tight text-slate-50 md:text-headline">{data.nextStep.action}</p>
            <p className="mt-2 max-w-xl text-body text-slate-300">{data.nextStep.detail}</p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link href={data.nextStep.href} className={buttonVariants()}>
                {data.nextStep.cta}
                <ArrowRight aria-hidden className="h-4 w-4" />
              </Link>
              {data.nextStep.secondary && (
                <Link href={data.nextStep.secondary.href} className={buttonVariants({ variant: "secondary" })}>
                  {data.nextStep.secondary.cta}
                </Link>
              )}
            </div>
          </ColorCard>
          <ColorCard color="ocean" className="p-5 md:p-6">
            <Eyebrow>How it works</Eyebrow>
            <ul className="mt-4 grid gap-4">
              <HowRow icon={<Video className="h-5 w-5" />} title="Live classes on Discord" body="A real teacher every week, at a time you pick." />
              <HowRow icon={<Map className="h-5 w-5" />} title="Your roadmap" body="Scales one at a time, opened by your teacher as you go." />
              <HowRow icon={<Flame className="h-5 w-5" />} title="10 minutes a day" body="Daily finger practice builds your streak and your hands." />
            </ul>
          </ColorCard>
          <TipCard tip={data.tip} />
        </div>
      </WideLayout>
    );
  }

  const { practice, nextClass } = data;
  const board = await getWeeklyLeaderboard(session.user.id);
  const { top, me } = topWithMe(board.rows, 5, session.user.id);
  const joinNow = nextClass !== null && !nextClass.inPerson && (nextClass.scheduledAt.getTime() - Date.now()) / 60_000 <= 30;
  const classLength = nextClass ? Math.round((nextClass.creditsSpent / CREDITS_PER_CLASS) * CLASS_MINUTES) : CLASS_MINUTES;

  return (
    <WideLayout>
      <div className="grid grid-cols-1 gap-3">
        {greeting}
        {data.celebration && <CelebrationCard win={data.celebration} />}

        {/* Phones get one column in the order below (the two column wrappers dissolve and `order` sorts the cards); from lg the
            left column holds today, the roadmap and the tip, the right one the class, practice and friends. */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="contents min-w-0 lg:grid lg:gap-3">
            {/* Today's one thing. */}
            {data.gettingStarted.length > 0 && <GettingStartedCard items={data.gettingStarted} className="order-1" />}

            <ColorCard color="sunset" className="order-2 p-5 md:p-6">
              <Eyebrow>Today</Eyebrow>
              <p className="mt-2 text-title font-semibold leading-snug text-slate-50">{data.nextStep.action}</p>
              <p className="mt-1 text-body text-slate-300">{data.nextStep.detail}</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {joinNow && nextClass ? (
                  <DiscordLink
                    href={nextClass.discordChannelId ? discordChannelUrl(nextClass.discordChannelId) : DISCORD_INVITE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants()}
                  >
                    Join your class
                  </DiscordLink>
                ) : (
                  <Link href={data.nextStep.href} className={buttonVariants()}>
                    {data.nextStep.cta}
                    <ArrowRight aria-hidden className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </ColorCard>

            <div className="deck-card order-3">
            <RoadmapCard
              name={data.roadmap.name}
              artwork={data.roadmap.artwork}
              current={data.currentScale}
              percent={data.progress.percent}
              completedScales={data.progress.completedScales}
              totalScales={data.progress.totalScales}
            />
            </div>

            <div className="deck-card order-8 empty:hidden">
              <TeacherNotesCard studentId={session.user.id} />
            </div>

            <TipCard tip={data.tip} className="order-9" />
          </div>

          <div className="contents min-w-0 lg:grid lg:gap-3">
            <ColorCard color="ocean" className="order-4 p-5">
              <Eyebrow>Next class</Eyebrow>
              {nextClass ? (
                <>
                  <p className="mt-2 text-body font-semibold text-slate-50">{formatEtDateTime(nextClass.scheduledAt)}</p>
                  <p className="mt-1 text-small text-slate-400">{untilLabel(nextClass.scheduledAt)}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <a
                      href={`/api/calendar/class?s=${encodeURIComponent(nextClass.scheduledAt.toISOString())}&m=${classLength}`}
                      className="tap inline-flex items-center text-small font-semibold text-slate-300 underline-offset-4 hover:text-slate-50 hover:underline"
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
                  <Link href="/lessons" className={cn(buttonVariants({ variant: "secondary" }), "mt-3")}>
                    Book a class
                  </Link>
                </>
              )}
            </ColorCard>

            <ColorCard color="rose" className="order-5 p-5">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <Eyebrow>Practice</Eyebrow>
                  <Link href="/streak" className="mt-2 inline-flex items-center gap-1.5 text-body font-semibold text-slate-50 hover:underline">
                    <Flame
                      aria-hidden
                      className={cn("h-5 w-5", practice.completedToday ? "text-signal-fg" : "text-slate-400")}
                      fill={practice.completedToday ? "currentColor" : "none"}
                    />
                    {practice.streak} day streak
                  </Link>
                  <p className="mt-1 text-small text-slate-400">
                    {practice.completedToday
                      ? "Done for today"
                      : `${Math.max(0, Math.ceil((DAILY_GOAL_SECONDS - practice.todaySeconds) / 60))} minutes left today`}
                  </p>
                </div>
                <ProgressRing
                  value={Math.min(data.weekMinutes, WEEKLY_GOAL_MINUTES)}
                  max={WEEKLY_GOAL_MINUTES}
                  size={76}
                  strokeWidth={7}
                  label={`This week: ${data.weekMinutes} of ${WEEKLY_GOAL_MINUTES} practice minutes`}
                  caption={`${data.weekMinutes}/${WEEKLY_GOAL_MINUTES} min`}
                />
              </div>
              {!practice.completedToday && (
                <Link href="/practice" className={cn(buttonVariants({ variant: "secondary" }), "mt-4")}>
                  {practice.todaySeconds > 0 ? "Continue practice" : "Start practice"}
                </Link>
              )}
            </ColorCard>

            <ColorCard color="forest" className="order-6 p-5">
              <Eyebrow>Progress</Eyebrow>
              <div className="mt-3 flex items-center gap-5">
                <ProgressRing
                  value={data.progress.itemsDone}
                  max={data.progress.itemsTotal}
                  size={76}
                  strokeWidth={7}
                  label={`Roadmap progress: ${data.progress.itemsDone} of ${data.progress.itemsTotal} steps done`}
                  caption={`${data.progress.itemsDone}/${data.progress.itemsTotal} steps`}
                />
                <div className="grid flex-1 grid-cols-2 gap-x-3 gap-y-3">
                  <Stat value={`${data.progress.completedScales}/${data.progress.totalScales}`} label="Scales" />
                  <Stat value={`${data.badgeCount}`} label="Badges" />
                  <Stat value={`${practice.streak}`} label="Day streak" />
                  <Stat value={formatCredits(data.credits)} label="Credits" />
                </div>
              </div>
            </ColorCard>

            <ColorCard color="gold" className="order-7 p-5">
              <div className="flex items-center justify-between gap-3">
                <Eyebrow>Leaderboard this week</Eyebrow>
                <Trophy aria-hidden className="h-4 w-4 text-slate-400" />
              </div>
              {top.length > 0 ? (
                <div className="mt-3">
                  <LeaderboardRows rows={me ? [...top, me] : top} viewerId={session.user.id} compact />
                </div>
              ) : (
                <p className="mt-2 text-body text-slate-300">Nobody has practiced yet this week. Be the first.</p>
              )}
              <Link href="/leaderboard" className="tap mt-3 inline-flex items-center gap-1.5 text-small font-semibold text-slate-300 underline-offset-4 hover:text-slate-50 hover:underline">
                See the whole board
              </Link>
            </ColorCard>

            {/* Badges moved here from the Roadmap (2026-10-30), so the scales page has room for its tabs and toggle. */}
            <ColorCard color="violet" className="order-11 p-5">
              <div className="flex items-center justify-between gap-3">
                <Eyebrow>Badges</Eyebrow>
                <Medal aria-hidden className="h-4 w-4 text-slate-400" />
              </div>
              <p className="mt-2 text-title font-semibold text-slate-50">
                {data.earnedBadgeCodes.length} of {BADGES.length} earned
              </p>
              {/* The whole grid is long, so it opens on request. */}
              <details className="group mt-3">
                <summary className="tap inline-flex cursor-pointer list-none items-center gap-1.5 text-small font-semibold text-slate-300 underline-offset-4 hover:text-slate-50 hover:underline [&::-webkit-details-marker]:hidden">
                  <span className="group-open:hidden">Show all badges</span>
                  <span className="hidden group-open:inline">Hide badges</span>
                </summary>
                <div className="mt-3">
                  <BadgeGrid earnedCodes={new Set(data.earnedBadgeCodes)} />
                </div>
              </details>
            </ColorCard>

            <ColorCard color="plum" className="order-10 p-5">
              <Eyebrow>Friends</Eyebrow>
              {data.friendsPracticing.length > 0 ? (
                <p className="mt-2 text-body text-slate-100">
                  <span className="font-semibold">{data.friendsPracticing.slice(0, 3).join(", ")}</span>{" "}
                  {data.friendsPracticing.length === 1 ? "is" : "are"} practicing right now.
                </p>
              ) : data.friendCount > 0 ? (
                <p className="mt-2 text-body text-slate-300">
                  {data.friendCount} friend{data.friendCount === 1 ? "" : "s"}. Nobody is practicing right now, so you could be first today.
                </p>
              ) : (
                <p className="mt-2 text-body text-slate-300">Practice is more fun with friends. Add someone from the studio.</p>
              )}
              <Link href="/friends" className="tap mt-3 inline-flex items-center gap-1.5 text-small font-semibold text-slate-300 underline-offset-4 hover:text-slate-50 hover:underline">
                <Users aria-hidden className="h-4 w-4" />
                {data.friendCount > 0 ? "See friends" : "Find friends"}
              </Link>
            </ColorCard>
          </div>
        </div>
      </div>
    </WideLayout>
  );
}

function HowRow({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <li className="flex items-start gap-3">
      <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neu-base text-signal-fg shadow-pressed-low">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-body font-semibold text-slate-50">{title}</span>
        <span className="block text-small text-slate-400">{body}</span>
      </span>
    </li>
  );
}

function TipCard({ tip, className }: { tip: { title: string; body: string }; className?: string }) {
  return (
    <ColorCard color="teal" className={cn("p-5", className)}>
      <div className="flex items-center gap-2 text-slate-400">
        <Lightbulb aria-hidden className="h-4 w-4" />
        <Eyebrow className="text-slate-400">Tip of the day</Eyebrow>
      </div>
      <p className="mt-2 text-body font-semibold text-slate-50">{tip.title}</p>
      <p className="mt-1 text-body text-slate-300">{tip.body}</p>
    </ColorCard>
  );
}

/** One figure and its label. */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-body font-semibold tabular-nums text-slate-50">{value}</p>
      <p className="text-small text-slate-400">{label}</p>
    </div>
  );
}

/** First-week checklist: each row ticks itself when the real thing happens, and the card is gone once all are done. */
function GettingStartedCard({ items, className }: { items: { done: boolean; label: string; detail: string; href: string; external: boolean }[]; className?: string }) {
  return (
    <ColorCard color="indigo" className={cn("p-5", className)}>
      <Eyebrow>
        Get started · {items.filter((g) => g.done).length} of {items.length}
      </Eyebrow>
      <ul className="mt-3 grid gap-1">
        {items.map((g) => {
          const row = (
            <>
              <span
                aria-hidden
                className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full", g.done ? "bg-signal text-slate-950" : "bg-neu-base shadow-pressed-low")}
              >
                {g.done && <Check className="h-3 w-3" strokeWidth={3.5} />}
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
    </ColorCard>
  );
}

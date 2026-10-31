import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarCheck, Check, Clock, Flame, Lightbulb, Map, Sparkles, Ticket, Trophy, Users, Video } from "@/components/ui/appIcons";
import { getServerAuthSession } from "@/lib/auth";
import { getHomeData } from "@/lib/homeData";
import { getWeeklyLeaderboard } from "@/lib/leaderboard";
import { DAILY_GOAL_SECONDS } from "@/lib/fingerPractice";
import { WEEKLY_GOAL_MINUTES } from "@/lib/homeRules";
import { formatEtDateTime } from "@/lib/classScheduleLabels";
import { formatCredits } from "@/lib/classCreditPricing";
import { TeacherNotesCard } from "@/components/dashboard/TeacherNotesCard";
import { DISCORD_INVITE_URL, discordChannelUrl } from "@/lib/discord";
import { cn } from "@/lib/utils";
import { WideLayout } from "@/components/layout/PageLayouts";
import { TodayGreeting } from "@/components/dashboard/TodayGreeting";
import { buttonVariants } from "@/components/ui/button";
import { DiscordLink } from "@/components/ui/DiscordLink";
import { CelebrationCard } from "@/components/home/CelebrationCard";
import { BadgesSheetButton } from "@/components/home/BadgesSheetButton";
import { HomeHero } from "@/components/home/HomeHero";
import { HomeRow, HomeRows } from "@/components/home/HomeRow";
import { GlanceTiles } from "@/components/home/GlanceTiles";
import { PathCard, ShelfCard } from "@/components/home/ShelfCards";
import { Shelf, ShelfItem } from "@/components/ui/Shelf";
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
 * Home: a welcome and the one thing to do today, as one hero and quiet rows (2026-10-30, the owner picked "one hero, then rows"). A new account (no plan, no trial) gets the free trial class and how the studio
 * works; a student gets today's step, their roadmap, the next class, practice, a tip and their friends. The course itself lives on
 * the Roadmap screen (/roadmap). Design: docs/superpowers/specs/2026-10-29-new-home-and-roadmaps-design.md.
 */
export default async function HomePage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/dashboard");
  const data = await getHomeData({ id: session.user.id, role: session.user.role, email: session.user.email ?? null });

  // The greeting stays put while the page scrolls under it (every page's heading does), so it sits above both columns.
  const greeting = (
    <div data-deck-header className="deck-header -mt-4 pt-8 md:pt-10 lg:pb-6">
      <TodayGreeting name={data.name} />
    </div>
  );

  if (data.isNew) {
    return (
      <WideLayout>
        {greeting}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-10">
          <div className="grid min-w-0 grid-cols-1 gap-6">
            <HomeHero
              artwork={data.roadmap.artwork}
              eyebrow="Start here"
              title={data.nextStep.action}
              detail={data.nextStep.detail}
              actions={
                <>
                  <Link href={data.nextStep.href} className={buttonVariants({ size: "lg" })}>
                    {data.nextStep.cta}
                    <ArrowRight aria-hidden className="h-4 w-4" />
                  </Link>
                  {data.nextStep.secondary && (
                    <Link href={data.nextStep.secondary.href} className={buttonVariants({ variant: "secondary", size: "lg" })}>
                      {data.nextStep.secondary.cta}
                    </Link>
                  )}
                </>
              }
            />
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-8">
            <HomeRows title="How it works">
              <li>
                <HomeRow href="/lessons" icon={<Video />} title="Live classes on Discord" detail="A real teacher every week, at a time you pick." />
              </li>
              <li>
                <HomeRow href="/roadmap" icon={<Map />} title="Your roadmap" detail="Scales one at a time, opened by your teacher as you go." />
              </li>
              <li>
                <HomeRow href="/practice" icon={<Flame />} title="10 minutes a day" detail="Daily finger practice builds your streak and your hands." />
              </li>
            </HomeRows>
            <TipLine tip={data.tip} />
          </div>
        </div>
      </WideLayout>
    );
  }

  const { practice, nextClass } = data;
  const board = await getWeeklyLeaderboard(session.user.id);
  const myRow = board.rows.find((r) => r.userId === session.user.id) ?? null;
  const leader = board.rows[0] ?? null;
  const joinNow = nextClass !== null && !nextClass.inPerson && (nextClass.scheduledAt.getTime() - Date.now()) / 60_000 <= 30;
  const minutesLeft = Math.max(0, Math.ceil((DAILY_GOAL_SECONDS - practice.todaySeconds) / 60));

  /**
   * Home, one hero then rows: the roadmap picture carries today's one thing, and everything else is a quiet line on the page
   * (no cards), so the next step is the only loud thing here. On a computer the hero sits on the left and the rows on the right.
   */
  return (
    <WideLayout>
      {greeting}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-10">
        <div className="grid min-w-0 grid-cols-1 gap-6">
          {data.celebration && <CelebrationCard win={data.celebration} />}
          <HomeHero
            artwork={data.roadmap.artwork}
            eyebrow="Today"
            title={data.nextStep.action}
            detail={data.nextStep.detail}
            actions={
              joinNow && nextClass ? (
                <DiscordLink
                  href={nextClass.discordChannelId ? discordChannelUrl(nextClass.discordChannelId) : DISCORD_INVITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ size: "lg" })}
                >
                  Join your class
                </DiscordLink>
              ) : (
                <Link href={data.nextStep.href} className={buttonVariants({ size: "lg" })}>
                  {data.nextStep.cta}
                  <ArrowRight aria-hidden className="h-4 w-4" />
                </Link>
              )
            }
            progress={{
              name: data.roadmap.name,
              current: data.currentScale ? `${data.currentScale.code} · ${data.currentScale.title}` : null,
              percent: data.progress.percent,
            }}
          />
          <GlanceTiles
            items={[
              {
                href: "/practice",
                label: "Streak",
                icon: <Flame />,
                value: String(practice.streak),
                unit: practice.streak === 1 ? "day" : "days",
                hint: practice.completedToday ? "Done today" : `${minutesLeft} min left today`,
                meter: { value: Math.min(practice.todaySeconds, DAILY_GOAL_SECONDS), max: DAILY_GOAL_SECONDS, label: practice.completedToday ? "Today's practice is done" : `${minutesLeft} minutes of practice left today` },
              },
              {
                href: "/streak",
                label: "This week",
                icon: <Clock />,
                value: String(data.weekMinutes),
                unit: "min",
                hint: `Goal ${WEEKLY_GOAL_MINUTES} min`,
                bars: { values: data.weekDays, current: data.todayIndex, label: `Practice minutes each day this week: ${data.weekDays.join(", ")}` },
              },
              {
                href: "/lessons",
                label: "Credits",
                icon: <Ticket />,
                value: formatCredits(data.credits),
                unit: data.credits === 1 ? "class" : "classes",
                hint: nextClass ? `Next ${untilLabel(nextClass.scheduledAt)}` : "No class booked",
                alert: data.credits === 0,
              },
            ]}
          />
          {data.path.length > 0 && (
            <Shelf title="Your path" aside={`${data.progress.completedScales} of ${data.progress.totalScales} done`}>
              {data.path.map((p, i) => (
                <ShelfItem key={p.slug} className="w-36 sm:w-40">
                  <PathCard step={i + 1} {...p} />
                </ShelfItem>
              ))}
            </Shelf>
          )}
          {data.gettingStarted.length > 0 && <GettingStarted items={data.gettingStarted} />}
          <TeacherNotesCard studentId={session.user.id} />
          <TipLine tip={data.tip} className="hidden lg:flex" />
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-8">
          <HomeRows title="This week">
            <li>
              <HomeRow
                href="/lessons"
                icon={<CalendarCheck />}
                title={nextClass ? formatEtDateTime(nextClass.scheduledAt) : "No class booked"}
                detail={nextClass ? `Next class, ${untilLabel(nextClass.scheduledAt)}` : "Book your weekly class"}
              />
            </li>
            <li>
              <HomeRow
                href="/roadmap"
                icon={<Map />}
                title={`${data.progress.completedScales} of ${data.progress.totalScales} scales`}
                detail={`${data.progress.itemsDone} of ${data.progress.itemsTotal} steps · ${formatCredits(data.credits)} credits`}
              />
            </li>
          </HomeRows>

          {/* Studio as a shelf you swipe through, the way Spotify shows its rows. */}
          <Shelf title="Studio">
            <ShelfItem>
              <ShelfCard
                href="/leaderboard"
                icon={<Trophy />}
                title={myRow ? `You're ${ordinal(myRow.place)} this week` : "Leaderboard"}
                detail={leader ? `${leader.name} leads with ${leader.minutes} min` : "Nobody has practiced yet"}
              />
            </ShelfItem>
            <ShelfItem>
              <ShelfCard
                href="/friends"
                icon={<Users />}
                title={data.friendCount > 0 ? `${data.friendCount} friend${data.friendCount === 1 ? "" : "s"}` : "Friends"}
                detail={
                  data.friendsPracticing.length > 0
                    ? `${data.friendsPracticing.slice(0, 2).join(", ")} ${data.friendsPracticing.length === 1 ? "is" : "are"} practicing`
                    : data.friendCount > 0
                      ? "Nobody is practicing right now"
                      : "Practice is more fun with friends"
                }
              />
            </ShelfItem>
            <ShelfItem>
              <BadgesSheetButton earnedCodes={data.earnedBadgeCodes} total={BADGES.length} card />
            </ShelfItem>
            <ShelfItem>
              <ShelfCard href="/streak" icon={<Flame />} title={`${practice.streak} day streak`} detail={practice.completedToday ? "Done for today" : "Practice today to keep it"} />
            </ShelfItem>
          </Shelf>

          <TipLine tip={data.tip} className="lg:hidden" />
        </div>
      </div>
    </WideLayout>
  );
}

/** 1st, 2nd, 3rd, 4th. */
function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}

/** The tip of the day as a quiet line on the page, not a card. */
function TipLine({ tip, className }: { tip: { title: string; body: string }; className?: string }) {
  return (
    <aside className={cn("flex items-start gap-3 text-small text-slate-400", className)}>
      <Lightbulb aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-signal-fg" />
      <p>
        <span className="font-semibold text-slate-200">{tip.title}.</span> {tip.body}
      </p>
    </aside>
  );
}

/** First-week checklist, as rows: each ticks itself when the real thing happens, and the list is gone once all are done. */
function GettingStarted({ items }: { items: { done: boolean; label: string; detail: string; href: string; external: boolean }[] }) {
  return (
    <HomeRows title="Get started" aside={`${items.filter((g) => g.done).length} of ${items.length}`}>
      {items.map((g) =>
        g.done ? (
          <li key={g.label} className="flex min-h-14 items-center gap-3.5 px-4 py-2">
            <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-slate-50/8 text-slate-400">
              <Check className="h-4 w-4" strokeWidth={3} />
            </span>
            <span className="text-body text-slate-500 line-through">
              {g.label}
              <span className="sr-only"> (done)</span>
            </span>
          </li>
        ) : (
          <li key={g.label}>
            <HomeRow href={g.href} external={g.external} icon={<Sparkles />} title={g.label} detail={g.detail} />
          </li>
        ),
      )}
    </HomeRows>
  );
}

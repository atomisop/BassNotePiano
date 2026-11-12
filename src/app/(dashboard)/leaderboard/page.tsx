import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { getWeeklyLeaderboard } from "@/lib/leaderboard";
import { WideLayout } from "@/components/layout/PageLayouts";
import { Eyebrow } from "@/components/ui/Card";
import { HeroBand } from "@/components/ui/HeroBand";
import { ActionTiles } from "@/components/ui/ActionTiles";
import { CalendarCheck, Flame, Users } from "@/components/ui/appIcons";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { LeaderSpot, LeaderboardRows } from "@/components/home/LeaderboardRows";
import { Meta } from "@/components/ui/CardKit";
import { LeaderboardPrivacySwitch } from "@/components/home/LeaderboardPrivacySwitch";
import { PageBack } from "@/components/ui/BackLink";

export const metadata = { title: "Leaderboard" };

/** A quiet card under the band (DESIGN.md, "Band, sheet and tiles" 6); each one is a card of the deck. */
const QUIET_CARD = "deck-card relative rounded-card bg-neu-base shadow-raised-low";
/** Rows shown under the leader before the rest fold away (your own place is on the band either way). */
const FIRST_ROWS = 9;

/** 1st, 2nd, 3rd, 4th. */
function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}

/**
 * The studio leaderboard in full: practice minutes this week, Sunday to Saturday, with everyone's streak and badges.
 * Read in one order (DESIGN.md, Hierarchy and "Band, sheet and tiles"): your own place is the band, a few tiles say where to go
 * next, the leader is set apart at the top of the board, and everyone else is a quiet row.
 */
export default async function LeaderboardPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/leaderboard");
  const board = await getWeeklyLeaderboard(session.user.id);
  const mine = board.rows.find((r) => r.userId === session.user.id);
  const leaders = board.rows.filter((r) => r.place === 1);
  const others = board.rows.filter((r) => r.place !== 1);
  const leader = leaders[0] ?? null;
  const canJoin = !mine && !board.viewerHidden && !board.viewerIsLinkedChild && session.user.role !== "ADMIN";

  const leaderLine = leader ? `${leader.name} leads with ${leader.minutes} min` : null;

  return (
    <WideLayout deckDesktop>
      <div className="mx-auto grid max-w-2xl gap-3">
        <div data-deck-header className="deck-header pt-4 md:pt-6">
          <PageBack href="/dashboard" />
          <Eyebrow>Studio</Eyebrow>
          <h1 className="mt-1 text-hero font-semibold text-slate-50">Leaderboard</h1>
        </div>

        {/* The one fact here: your place this week, on the band. Someone who is not on the board sees why, or the way onto it. */}
        {mine ? (
          <HeroBand
            eyebrow="This week"
            title="Your place"
            figure={
              <>
                {ordinal(mine.place)}
                <span className="ml-2 text-body font-medium text-white/90">of {board.rows.length}</span>
              </>
            }
            meta={<Meta items={[`${mine.minutes} min this week`, mine.place === 1 ? (leaders.length > 1 ? "Tied for the lead" : "You lead the studio") : leaderLine]} />}
            artwork="ocean"
            className="deck-card"
          />
        ) : canJoin ? (
          <HeroBand eyebrow="This week" title="Practice today to get on the board" meta={leaderLine ?? undefined} artwork="ocean" className="deck-card">
            <div className="flex justify-end pt-3">
              <Link href="/practice" className={buttonVariants({ className: "w-full sm:w-auto" })}>
                Start practice
              </Link>
            </div>
          </HeroBand>
        ) : (
          <HeroBand
            eyebrow="This week"
            title={board.rows.length === 1 ? "Student on the board" : "Students on the board"}
            figure={board.rows.length}
            meta={leaderLine ?? "Nobody has practiced yet this week"}
            artwork="ocean"
            className="deck-card"
          />
        )}

        <ActionTiles
          title="Where to next"
          items={[
            { href: "/practice", label: "Practice", detail: "Add minutes today", icon: <Flame /> },
            { href: "/streak", label: "Your streak", detail: mine ? `${mine.streak} ${mine.streak === 1 ? "day" : "days"} in a row` : "Days in a row", icon: <CalendarCheck /> },
            { href: "/friends", label: "Friends", detail: "Practice together", icon: <Users /> },
          ]}
          className="py-2"
        />

        <section aria-label="The board" className={cn(QUIET_CARD, "p-4 md:p-5")}>
          <div className="flex items-center justify-between gap-3 px-2.5 pb-3">
            <h2 className="shrink-0 whitespace-nowrap text-caption font-medium uppercase tracking-caps text-slate-500">The board</h2>
            <span className="text-right text-caption text-slate-500">Minutes this week. New week every Sunday.</span>
          </div>
          {board.rows.length > 0 ? (
            <>
              {/* The leader, set apart from everyone else (a tie shares the spot). */}
              <div className="px-2.5">
                <LeaderSpot rows={leaders} viewerId={session.user.id} />
              </div>
              {others.length > 0 && (
                <div className="mt-4 border-t border-slate-50/8 pt-2">
                  <LeaderboardRows rows={others.slice(0, FIRST_ROWS)} viewerId={session.user.id} />
                  {/* A long board shows its top and folds the rest (DESIGN.md, Hierarchy rule 9). */}
                  {others.length > FIRST_ROWS && (
                    <details className="group/more">
                      <summary className="tap flex cursor-pointer list-none items-center px-2.5 py-3 text-small font-medium text-slate-400 hover:text-slate-200 group-open/more:hidden [&::-webkit-details-marker]:hidden">
                        Show {others.length - FIRST_ROWS} more
                      </summary>
                      <div className="border-t border-slate-50/6">
                        <LeaderboardRows rows={others.slice(FIRST_ROWS)} viewerId={session.user.id} />
                      </div>
                    </details>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="py-6 text-center text-body text-slate-400">Nobody has practiced yet this week. Be the first.</p>
          )}
        </section>

        {session.user.role !== "ADMIN" && (
          <div className={cn(QUIET_CARD, "p-4 md:p-5")}>
            {board.viewerIsLinkedChild ? (
              <p className="text-small text-slate-400">Accounts linked to a parent are never shown on the leaderboard.</p>
            ) : (
              <LeaderboardPrivacySwitch initialHidden={board.viewerHidden} />
            )}
          </div>
        )}
      </div>
    </WideLayout>
  );
}

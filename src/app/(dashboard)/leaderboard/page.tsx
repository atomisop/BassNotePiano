import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { getWeeklyLeaderboard } from "@/lib/leaderboard";
import { WideLayout } from "@/components/layout/PageLayouts";
import { Card, Eyebrow } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/button";
import { LeaderSpot, LeaderboardRows } from "@/components/home/LeaderboardRows";
import { Meta } from "@/components/ui/CardKit";
import { LeaderboardPrivacySwitch } from "@/components/home/LeaderboardPrivacySwitch";
import { PageBack } from "@/components/ui/BackLink";
import { Hint } from "@/components/ui/Hint";

export const metadata = { title: "Leaderboard" };

/** 1st, 2nd, 3rd, 4th. */
function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}

/**
 * The studio leaderboard in full: practice minutes this week, Sunday to Saturday, with everyone's streak and badges.
 * Read in one order (DESIGN.md, Hierarchy): your own place is the hero, the leader is set apart at the top of the board, and
 * everyone else is a quiet row.
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

  return (
    <WideLayout deckDesktop>
      <div className="mx-auto grid max-w-2xl gap-3">
        <div data-deck-header className="deck-header pt-4 md:pt-6">
          <PageBack href="/dashboard" />
          <Eyebrow>Studio</Eyebrow>
          <h1 className="mt-1 text-hero font-semibold text-slate-50">Leaderboard</h1>
          <p className="mt-1 text-body text-slate-400"><Hint>Practice minutes this week. A new week starts every Sunday.</Hint></p>
        </div>

        {/* Your place: the one big figure on the screen. */}
        {mine && (
          <Card className="deck-card p-5 md:p-6">
            <Eyebrow>Your place this week</Eyebrow>
            <p className="mt-2 text-figure font-bold tabular-nums text-slate-50">
              {ordinal(mine.place)}
              <span className="ml-2 text-body font-normal text-slate-400">of {board.rows.length}</span>
            </p>
            <Meta
              className="mt-3"
              items={[
                `${mine.minutes} min this week`,
                mine.place === 1 ? (leaders.length > 1 ? "Tied for the lead" : "You lead the studio") : leader ? `${leader.name} leads with ${leader.minutes} min` : null,
              ]}
            />
          </Card>
        )}
        {canJoin && (
          <Card className="deck-card p-5 md:p-6">
            <p className="text-title font-semibold text-slate-50">Practice today to get on the board</p>
            <Link href="/practice" className={buttonVariants({ className: "mt-4" })}>
              Start practice
            </Link>
          </Card>
        )}

        <Card className="deck-card p-4 md:p-5">
          {board.rows.length > 0 ? (
            <>
              {/* The leader, set apart from everyone else (a tie shares the spot). */}
              <LeaderSpot rows={leaders} viewerId={session.user.id} />
              {others.length > 0 && (
                <div className="mt-4 border-t border-slate-50/8 pt-2">
                  <LeaderboardRows rows={others} viewerId={session.user.id} />
                </div>
              )}
            </>
          ) : (
            <p className="py-6 text-center text-body text-slate-400"><Hint>Nobody has practiced yet this week. Be the first.</Hint></p>
          )}
        </Card>

        {session.user.role !== "ADMIN" && (
          <Card className="deck-card p-4 md:p-5">
            {board.viewerIsLinkedChild ? (
              <p className="text-small text-slate-400"><Hint>Accounts linked to a parent are never shown on the leaderboard.</Hint></p>
            ) : (
              <LeaderboardPrivacySwitch initialHidden={board.viewerHidden} />
            )}
          </Card>
        )}
      </div>
    </WideLayout>
  );
}

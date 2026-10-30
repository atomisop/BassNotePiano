import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { getWeeklyLeaderboard } from "@/lib/leaderboard";
import { WideLayout } from "@/components/layout/PageLayouts";
import { Card, Eyebrow } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/button";
import { LeaderboardRows } from "@/components/home/LeaderboardRows";
import { LeaderboardPrivacySwitch } from "@/components/home/LeaderboardPrivacySwitch";

export const metadata = { title: "Leaderboard" };

/** The studio leaderboard in full: practice minutes this week, Sunday to Saturday, with everyone's streak and badges. */
export default async function LeaderboardPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/leaderboard");
  const board = await getWeeklyLeaderboard(session.user.id);
  const mine = board.rows.find((r) => r.userId === session.user.id);

  return (
    <WideLayout deckDesktop>
      <div className="mx-auto grid max-w-2xl gap-3">
        <div data-deck-header className="deck-header pt-4 md:pt-6">
          <Eyebrow>Studio</Eyebrow>
          <h1 className="mt-1 text-hero font-semibold text-slate-50">Leaderboard</h1>
          <p className="mt-1 text-body text-slate-400">Practice minutes this week. A new week starts every Sunday.</p>
        </div>

        <Card className="deck-card p-4 md:p-5">
          {board.rows.length > 0 ? (
            <LeaderboardRows rows={board.rows} viewerId={session.user.id} />
          ) : (
            <p className="py-6 text-center text-body text-slate-400">Nobody has practiced yet this week. Be the first.</p>
          )}
          {!mine && !board.viewerHidden && !board.viewerIsLinkedChild && session.user.role !== "ADMIN" && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-small text-slate-400">Practice today to get on the board.</p>
              <Link href="/practice" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                Start practice
              </Link>
            </div>
          )}
        </Card>

        {session.user.role !== "ADMIN" && (
          <Card className="deck-card p-4 md:p-5">
            {board.viewerIsLinkedChild ? (
              <p className="text-small text-slate-400">Accounts linked to a parent are never shown on the leaderboard.</p>
            ) : (
              <LeaderboardPrivacySwitch initialHidden={board.viewerHidden} />
            )}
          </Card>
        )}
      </div>
    </WideLayout>
  );
}

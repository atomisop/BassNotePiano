import { notFound, redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { getFriendProfile } from "@/lib/friendProfile";
import { BadgeGrid } from "@/components/gamification/BadgeGrid";
import { StreakDots } from "@/components/gamification/StreakDots";
import { BADGES } from "@/lib/badges";
import { WideLayout } from "@/components/layout/PageLayouts";
import { PageBack } from "@/components/ui/BackLink";
import { Avatar } from "@/components/ui/Avatar";
import { NudgeButton } from "@/components/social/NudgeButton";
import { nudgeSenderLabel } from "@/lib/nudgeRules";

export const metadata = { title: "Friend" };

export default async function FriendProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) redirect(`/login?callbackUrl=${encodeURIComponent(`/friends/${username}`)}`);

  const friend = await getFriendProfile(session.user.id, username);
  if (!friend) notFound();

  return (
    <WideLayout>
      <PageBack href="/friends" />
      <div className="flex items-center gap-4">
        <Avatar image={friend.image} label={friend.name ?? friend.username} size="xl" className="h-16 w-16" />
        <div className="min-w-0 flex-1">
          <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Friend</p>
          <h1 className="font-hero text-hero font-bold text-balance mt-1 text-slate-50">{friend.name ?? friend.username}</h1>
          <p className="text-small text-slate-500">@{friend.username}</p>
        </div>
        {!friend.practicedToday && <NudgeButton friendId={friend.id} friendName={nudgeSenderLabel(friend.name ?? friend.username)} size="default" />}
      </div>
      {friend.practicedToday && <p className="mt-4 text-small text-slate-400">Finished today&apos;s 10 minutes of practice.</p>}

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="glass-surface p-5">
          <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">{friend.streak > 0 ? `${friend.streak} day streak` : "Streak"}</p>
          <StreakDots currentStreak={friend.streak} />
        </div>
        <div className="glass-surface p-5">
          <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Longest streak</p>
          <p className="mt-2 text-body text-slate-50 font-semibold">
            {friend.longest} day{friend.longest === 1 ? "" : "s"}
          </p>
        </div>
        <div className="glass-surface p-5">
          <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Last 7 days</p>
          <p className="mt-2 text-body text-slate-50 font-semibold">{friend.doneLast7} of 7 practiced</p>
        </div>
      </div>

      <div className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="text-title text-slate-50 font-semibold">Badges</h2>
          <p className="text-small text-slate-500">
            {friend.badgeCodes.length} of {BADGES.length} earned
          </p>
        </div>
        <div className="mt-4 glass-surface p-6">
          <BadgeGrid earnedCodes={new Set(friend.badgeCodes)} />
        </div>
      </div>
    </WideLayout>
  );
}

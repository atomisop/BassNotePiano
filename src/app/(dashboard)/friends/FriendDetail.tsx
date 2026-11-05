"use client";

import { useEffect, useState } from "react";
import { StreakDots } from "@/components/gamification/StreakDots";
import { BADGES } from "@/lib/badges";
import type { FriendProfile } from "@/lib/friendProfile";
import { getFriendProfileAction } from "./actions";

/** The panel under a friend's row: their practice this week and badges. Loaded when the row is opened, so the list itself stays light. */
export function FriendDetail({ username }: { username: string }) {
  const [profile, setProfile] = useState<FriendProfile | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    getFriendProfileAction(username)
      .then((p) => alive && setProfile(p))
      .catch(() => alive && setProfile(null));
    return () => {
      alive = false;
    };
  }, [username]);

  if (profile === undefined) return <div className="h-24 animate-pulse rounded-lg bg-slate-50/5" aria-label="Loading" />;
  if (profile === null) return <p className="text-small text-slate-400">Couldn&apos;t load this profile. Try again in a moment.</p>;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">{profile.streak > 0 ? `${profile.streak} day streak` : "Streak"}</p>
        <StreakDots currentStreak={profile.streak} />
      </div>
      <dl className="grid grid-cols-3 gap-2 text-small">
        <div className="rounded-lg bg-slate-50/5 p-2.5">
          <dt className="text-slate-400">Longest</dt>
          <dd className="mt-0.5 font-semibold text-slate-50">
            {profile.longest} day{profile.longest === 1 ? "" : "s"}
          </dd>
        </div>
        <div className="rounded-lg bg-slate-50/5 p-2.5">
          <dt className="text-slate-400">Last 7 days</dt>
          <dd className="mt-0.5 font-semibold text-slate-50">{profile.doneLast7} of 7</dd>
        </div>
        <div className="rounded-lg bg-slate-50/5 p-2.5">
          <dt className="text-slate-400">Badges</dt>
          <dd className="mt-0.5 font-semibold text-slate-50">
            {profile.badgeCodes.length} of {BADGES.length}
          </dd>
        </div>
      </dl>
      {profile.practicedToday && <p className="text-small text-slate-400">Finished today&apos;s 10 minutes.</p>}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { StreakDots } from "@/components/gamification/StreakDots";
import { BADGES } from "@/lib/badges";
import type { FriendProfile } from "@/lib/friendProfile";
import { getFriendProfileAction } from "./actions";
import { Fact, Facts } from "@/components/ui/CardKit";

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

  if (profile === undefined) return <div className="h-24 animate-pulse rounded-control bg-slate-50/5" aria-label="Loading" />;
  if (profile === null) return <p className="text-small text-slate-400">Couldn&apos;t load this profile. Try again in a moment.</p>;

  // The streak is the one line you read first; the rest are small facts, value first (DESIGN.md, Hierarchy rule 3).
  return (
    <div className="space-y-3">
      <div>
        <p className="text-body font-semibold tabular-nums text-slate-50">{profile.streak > 0 ? `${profile.streak} day streak` : "No streak right now"}</p>
        <StreakDots currentStreak={profile.streak} />
      </div>
      <Facts columns={3} className="grid-cols-3">
        <Fact label="Longest" value={`${profile.longest} day${profile.longest === 1 ? "" : "s"}`} />
        <Fact label="Last 7 days" value={`${profile.doneLast7} of 7`} />
        <Fact label="Badges" value={`${profile.badgeCodes.length} of ${BADGES.length}`} />
      </Facts>
      {profile.practicedToday && <p className="text-small text-slate-400">Finished today&apos;s 10 minutes.</p>}
    </div>
  );
}

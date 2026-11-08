"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { setLeaderboardHiddenAction } from "@/app/(dashboard)/account/actions";
import { Hint } from "@/components/ui/Hint";

/** "Show me on the studio leaderboard": on by default; turning it off takes you off the board at once. */
export function LeaderboardPrivacySwitch({ initialHidden }: { initialHidden: boolean }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(initialHidden);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  const change = (show: boolean) => {
    const before = hidden;
    setHidden(!show);
    setFailed(false);
    startTransition(async () => {
      try {
        await setLeaderboardHiddenAction(!show);
        router.refresh();
      } catch {
        setHidden(before);
        setFailed(true);
      }
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-small text-slate-200">Show me on the studio leaderboard</p>
          <p className="text-small text-slate-500"><Hint>Your first name, last initial, photo, practice minutes this week, streak and badges.</Hint></p>
        </div>
        <Switch checked={!hidden} disabled={pending} onCheckedChange={change} aria-label="Show me on the studio leaderboard" />
      </div>
      {failed && <p className="mt-2 text-small text-red-300">That did not save. Try again.</p>}
    </div>
  );
}

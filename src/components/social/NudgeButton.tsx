"use client";

import { useState } from "react";
import { Bell } from "@/components/ui/appIcons";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/Toaster";
import { nudgeFriendAction } from "@/app/(dashboard)/friends/actions";

/**
 * "Nudge to practice": sends a friend the fixed reminder ("Your friend X is reminding you to practice"). Never carries any text the
 * person typed. The server decides if it may go (friends, limits, their settings) and answers with a plain reason when it may not.
 */
export function NudgeButton({ friendId, friendName, size = "sm" }: { friendId: string; friendName: string; size?: "sm" | "default" }) {
  const [pending, setPending] = useState(false);

  async function nudge() {
    if (pending) return;
    setPending(true);
    try {
      const result = await nudgeFriendAction(friendId);
      if (result.ok) toast.success(`Nudge sent to ${friendName}`);
      else toast.error(result.error);
    } catch {
      toast.error("That didn't go through. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={nudge}
      disabled={pending}
      aria-label={`Nudge ${friendName} to practice`}
      className={buttonVariants({ variant: "secondary", size, className: "inline-flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-60" })}
    >
      {pending ? <MorphingSquare size={12} className="shrink-0" /> : <Bell size={16} strokeWidth={1.75} aria-hidden />}
      Nudge
    </button>
  );
}

"use client";

import Link from "next/link";
import { Coins } from "@/components/ui/appIcons";
import { UsageBadge } from "@/components/ui/bubble-button";
import { useMeStatus } from "@/components/layout/MeStatusProvider";
import { MINUTES_PER_CREDIT, formatCredits } from "@/lib/classCreditPricing";

/**
 * The credit balance in the top bar, next to Ask AI. The badge itself is the "Bubble Button" usage badge from 21st.dev
 * (src/components/ui/bubble-button.tsx). One credit is one 45 minute class. The number is the live balance from
 * MeStatusProvider, minus classes already booked, so it moves the moment credits are granted, spent or refunded.
 */
export function CreditsBadge() {
  const status = useMeStatus();
  if (!status) return null;
  const { credits, heldCredits } = status;
  const label = `${formatCredits(credits)} credit${credits === 1 ? "" : "s"}`;
  return (
    <Link href="/lessons" aria-label={`${label} available. Open lessons.`} className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal">
      <UsageBadge
        icon={<Coins className="h-4 w-4 text-signal-fg" aria-hidden />}
        planName="Credits"
        usage={credits}
        limit={0}
        display={<span className="tabular-nums">{formatCredits(credits)}</span>}
        className="gap-1.5 bg-neu-base px-2.5 py-1 text-small font-semibold text-slate-100 shadow-raised-low"
        tooltipContent={
          <p>
            {label} available.
            <br />1 credit = 1 class ({MINUTES_PER_CREDIT} minutes).
            {heldCredits > 0 && (
              <>
                <br />
                {formatCredits(heldCredits)} held for classes you booked.
              </>
            )}
          </p>
        }
      />
    </Link>
  );
}

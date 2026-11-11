"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMeStatus } from "@/components/layout/MeStatusProvider";
import { billBarText } from "@/lib/billBarRules";
import { AlertTriangle, CreditCard } from "@/components/ui/appIcons";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The bill bar under the top bar on every signed-in screen, from the day a renewal bill opens until it is sent. It cannot be
 * closed. A friendly reminder up to the due day, red once it is late, then a countdown to the non-payment lock (paymentLock.ts).
 * Read from the live status (billDue), so paying takes it down at once.
 */
export function BillBar() {
  const bill = useMeStatus()?.billDue;
  const pathname = usePathname();
  // The words depend on the viewer's calendar day, which the server cannot know. The first paint uses the studio's clock on both
  // sides (so the page hydrates cleanly), then the viewer's own day takes over.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!bill) return null;
  const text = billBarText(bill, new Date(), mounted ? undefined : "America/New_York");
  const urgent = text.stage !== "reminder";
  const Icon = urgent ? AlertTriangle : CreditCard;
  return (
    <div
      role={urgent ? "alert" : "status"}
      className={cn(
        "bill-bar mx-4 flex shrink-0 items-center gap-3 rounded-2xl border p-3 md:mx-6 lg:mx-8",
        urgent ? "border-red-500/50 bg-red-500/12" : "border-signal/40 bg-signal/10",
      )}
    >
      <Icon aria-hidden className={cn("h-5 w-5 shrink-0", urgent ? "text-red-400" : "text-signal-fg")} />
      <div className="min-w-0 flex-1">
        <p className={cn("text-small font-semibold", urgent ? "text-red-300" : "text-slate-50")}>{text.title}</p>
        <p className="mt-0.5 text-small text-slate-300">{text.body}</p>
      </div>
      {pathname !== bill.href && (
        <Link href={bill.href} className={cn(buttonVariants({ variant: urgent ? "danger" : "primary", size: "sm" }), "shrink-0")}>
          Pay now
        </Link>
      )}
    </div>
  );
}

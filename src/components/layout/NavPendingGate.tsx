"use client";

import { useEffect, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { usePathname } from "next/navigation";
import { withViewTransition } from "@/lib/viewTransition";
import GenericLoading from "@/app/(dashboard)/loading";
import DashboardLoading from "@/app/(dashboard)/dashboard/loading";
import RoadmapLoading from "@/app/(dashboard)/roadmap/loading";
import LessonsLoading from "@/app/(dashboard)/lessons/loading";
import FriendsLoading from "@/app/(dashboard)/friends/loading";
import AccountLoading from "@/app/(dashboard)/account/loading";

export const NAV_PENDING_EVENT = "bnp-nav-pending";

const SKELETONS: Record<string, () => ReactNode> = {
  "/dashboard": () => <DashboardLoading />,
  "/roadmap": () => <RoadmapLoading />,
  "/lessons": () => <LessonsLoading />,
  "/friends": () => <FriendsLoading />,
  "/account": () => <AccountLoading />,
};

/**
 * Shows the next page's skeleton the instant a dock tab is tapped, instead of the old page sitting there while the server
 * works. It clears itself as soon as the address changes (the real page, or its own loading screen, takes over).
 */
export function NavPendingGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [pending, setPending] = useState<string | null>(null);

  // The real page arrives: crossfade from the skeleton to it.
  useEffect(() => {
    withViewTransition(() => flushSync(() => setPending(null)));
  }, [pathname]);

  useEffect(() => {
    let timer: number | undefined;
    const onPending = (e: Event) => {
      const href = (e as CustomEvent<string>).detail;
      // Crossfade from the page being left to the next page's skeleton.
      withViewTransition(() => flushSync(() => setPending(href)));
      window.clearTimeout(timer);
      // Never leave a skeleton up for good if a navigation fails.
      timer = window.setTimeout(() => setPending(null), 12_000);
    };
    window.addEventListener(NAV_PENDING_EVENT, onPending);
    return () => {
      window.removeEventListener(NAV_PENDING_EVENT, onPending);
      window.clearTimeout(timer);
    };
  }, []);

  if (pending && pending !== pathname) {
    const Skeleton = SKELETONS[pending] ?? (() => <GenericLoading />);
    return <>{Skeleton()}</>;
  }
  return <>{children}</>;
}

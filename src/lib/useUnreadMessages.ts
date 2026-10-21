"use client";

import { useMeStatus } from "@/components/layout/MeStatusProvider";

/**
 * Unread message count for the dock and sidebar badge: the server's count at page load until the shared status (MeStatusProvider, one poll
 * a minute plus a look on every page change and every "messages" announcement) has one. It used to poll on its own, twice (sidebar and dock).
 */
export function useUnreadMessages(initial: number): number {
  const status = useMeStatus();
  return status ? status.unreadMessages : initial;
}

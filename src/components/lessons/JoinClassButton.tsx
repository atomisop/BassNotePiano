"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DiscordConnectLink, DiscordLink, openInDiscord } from "@/components/ui/DiscordLink";
import { useMeStatus } from "@/components/layout/MeStatusProvider";
import { connectAndJoinPath } from "@/lib/inPlaceLinks";

/**
 * The class-time button. With Discord connected it opens the class call. Without it, it becomes "Connect Discord and join":
 * connecting comes back to Lessons, which opens the same call (see OpenClassCallOnArrival), so it is one tap either way.
 */
export function JoinClassButton({
  href,
  bookingId = null,
  label = "Join on Discord",
  className,
}: {
  href: string;
  /** The class, so Lessons opens this one after connecting. Null: the next class. */
  bookingId?: string | null;
  label?: string;
  className?: string;
}) {
  const status = useMeStatus();
  // Until the live status is known, assume connected (the common case) rather than flash the other button.
  const connected = status?.discordConnected ?? true;
  if (connected) {
    return (
      <DiscordLink href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {label}
      </DiscordLink>
    );
  }
  return (
    <DiscordConnectLink href={connectAndJoinPath(bookingId)} className={className}>
      Connect Discord and join
    </DiscordConnectLink>
  );
}

/** Back from connecting Discord with ?join=: opens that class call once, then takes ?join off the address. */
export function OpenClassCallOnArrival({ url }: { url: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const rest = new URLSearchParams(params.toString());
    rest.delete("join");
    router.replace(rest.size > 0 ? `${pathname}?${rest}` : pathname, { scroll: false });
    if (url) openInDiscord(url);
  }, [url, params, pathname, router]);
  return null;
}

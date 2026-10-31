"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { IosBanner } from "@/components/ui/IosBanner";
import { useMeStatus } from "@/components/layout/MeStatusProvider";
import { bannerSlotId } from "@/lib/bannerSlots";

// The slot (2am, 8am, 2pm, 8pm, the viewer's own clock) each banner last popped up in: a banner shows at most once per slot, four times a day.
const SLOT_KEY = (which: string) => `bnp-banner-slot-${which}`;

type Which = "phone" | "discord" | "practice";

export interface TopBannersProps {
  /** Ask for a phone number. Null when nobody should be asked. */
  phone: { seconds: number; verifying: boolean } | null;
  /** Ask to connect Discord (shown only while they are not connected). Null when switched off. */
  discord: { seconds: number; repeatMinutes: number } | null;
  /** Ask to practice (shown only while today's practice is not done). Null when switched off. */
  practice: { seconds: number; repeatMinutes: number } | null;
}

/**
 * A banner never asks for something the screen is already showing. Phone: the Settings page it links to. Discord: the Lessons
 * page's own connect card, and any desktop-width screen, where the sidebar carries the same invitation all the time. Practice:
 * the practice page itself. The owner's timing settings are untouched; a banner held back here simply comes back elsewhere.
 */
function alreadyShown(which: Which, pathname: string): boolean {
  // Pop-ups only on Home (2026-10-30, the UX laws pass: Flow and Selective Attention): never over a task on another screen. Home's own
  // hero already says to practice, so the practice banner never needs to show; its reminder still reaches the bell and push.
  if (pathname !== "/dashboard") return true;
  if (which === "practice") return true;
  return which === "discord" && typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked; the banner then simply follows the page's own timing.
  }
}

/**
 * The banners at the top of the app, one at a time and only while the tab is visible. Each one pops up at most once per slot, four slots
 * a day six hours apart from 8am (8am, 2pm, 8pm, 2am, the viewer's clock), for as long as the live status (MeStatusProvider) says it still
 * applies, so connecting Discord or finishing practice stops them at once, on every screen. Each time one pops up the reminder is also
 * kept in the notifications, so closing the banner never loses it. Order when several are due: phone, Discord, practice.
 */
export function TopBanners({ phone, discord, practice }: TopBannersProps) {
  const status = useMeStatus();
  const pathname = usePathname();
  const [active, setActive] = useState<Which | null>(null);
  const activeRef = useRef<Which | null>(null);
  const latest = useRef({ phone, discord, practice, status, pathname });
  latest.current = { phone, discord, practice, status, pathname };

  function show(which: Which) {
    const slot = bannerSlotId(new Date());
    write(SLOT_KEY(which), slot);
    write(SLOT_KEY("any"), slot);
    activeRef.current = which;
    setActive(which);
    // Keep the reminder in the notifications whether or not they close the banner. Best effort: a failure changes nothing on screen.
    void fetch("/api/me/banner-notice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: which, slot }) }).catch(() => undefined);
  }

  useEffect(() => {
    function check() {
      if (activeRef.current || document.visibilityState !== "visible") return;
      const { phone: p, discord: d, practice: r, status: s, pathname: path } = latest.current;
      const slot = bannerSlotId(new Date());
      // At most one pop-up per time slot in all, not one of each kind.
      if (read(SLOT_KEY("any")) === slot) return;
      const due = (which: Which) => read(SLOT_KEY(which)) !== slot;
      if (p && !alreadyShown("phone", path) && due("phone")) return show("phone");
      if (d && s && !s.discordConnected && !alreadyShown("discord", path) && due("discord")) return show("discord");
      if (r && s && !s.practicedToday && !alreadyShown("practice", path) && due("practice")) show("practice");
    }
    // A beat after the page settles, so a banner does not land on top of the page loading in.
    const first = setTimeout(check, 1500);
    const again = setInterval(check, 15000);
    return () => {
      clearTimeout(first);
      clearInterval(again);
    };
  }, []);

  // The status can change while a banner is up (they connected Discord in another tab): take the banner down.
  useEffect(() => {
    if (!status) return;
    if ((active === "discord" && status.discordConnected) || (active === "practice" && status.practicedToday)) {
      activeRef.current = null;
      setActive(null);
    }
  }, [status, active]);

  // Walking onto the screen a banner is about takes the banner down (it is not counted as dismissed, so it is not delayed).
  useEffect(() => {
    if (active && alreadyShown(active, pathname)) {
      activeRef.current = null;
      setActive(null);
    }
  }, [pathname, active]);

  function closed() {
    activeRef.current = null;
    setActive(null);
  }

  if (active === "phone" && phone) {
    return (
      <IosBanner
        key="phone"
        title="Add your phone number"
        body={phone.verifying ? "Confirm it with a 6-digit text. It takes under a minute." : "It helps us match your payments and reach you. It takes a few seconds."}
        href="/account?tab=account#phone"
        seconds={phone.seconds}
        onClose={closed}
      />
    );
  }
  if (active === "discord" && discord) {
    return (
      <IosBanner
        key="discord"
        title="Connect your Discord"
        body="Your private class call opens there before each lesson. Tap to connect, it takes a few seconds."
        href="/api/discord/connect"
        seconds={discord.seconds}
        onClose={closed}
      />
    );
  }
  if (active === "practice" && practice) {
    return (
      <IosBanner
        key="practice"
        title="Time to practice"
        body="Your 10 minutes of finger practice is not done today. Tap to start."
        href="/practice"
        seconds={practice.seconds}
        onClose={closed}
      />
    );
  }
  return null;
}

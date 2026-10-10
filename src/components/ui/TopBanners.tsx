"use client";

import { useEffect, useRef, useState } from "react";
import { IosBanner } from "@/components/ui/IosBanner";
import { useMeStatus } from "@/components/layout/MeStatusProvider";

const PHONE_DAY_KEY = "bnp-phone-banner-day";
const DISCORD_NEXT_KEY = "bnp-discord-banner-next";
const PRACTICE_NEXT_KEY = "bnp-practice-banner-next";

type Which = "phone" | "discord" | "practice";

export interface TopBannersProps {
  /** Ask for a phone number. Null when nobody should be asked. */
  phone: { seconds: number; verifying: boolean } | null;
  /** Ask to connect Discord (shown only while they are not connected). Null when switched off. */
  discord: { seconds: number; repeatMinutes: number } | null;
  /** Ask to practice (shown only while today's practice is not done). Null when switched off. */
  practice: { seconds: number; repeatMinutes: number } | null;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
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
 * The banners at the top of the app, one at a time and only while the tab is visible. Phone number: at most once per calendar
 * day. Discord and practice: they come back `repeatMinutes` after they were last shown, for as long as the live status
 * (MeStatusProvider) says it still applies, so connecting Discord or finishing practice stops them at once, on every screen.
 * Order when several are due: phone, Discord, practice.
 */
export function TopBanners({ phone, discord, practice }: TopBannersProps) {
  const status = useMeStatus();
  const [active, setActive] = useState<Which | null>(null);
  const activeRef = useRef<Which | null>(null);
  const latest = useRef({ phone, discord, practice, status });
  latest.current = { phone, discord, practice, status };

  function show(which: Which) {
    activeRef.current = which;
    setActive(which);
  }

  useEffect(() => {
    function check() {
      if (activeRef.current || document.visibilityState !== "visible") return;
      const { phone: p, discord: d, practice: r, status: s } = latest.current;
      if (p && read(PHONE_DAY_KEY) !== today()) {
        write(PHONE_DAY_KEY, today());
        return show("phone");
      }
      if (d && s && !s.discordConnected && Date.now() >= Number(read(DISCORD_NEXT_KEY) ?? 0)) return show("discord");
      if (r && s && !s.practicedToday && Date.now() >= Number(read(PRACTICE_NEXT_KEY) ?? 0)) show("practice");
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

  function closed(which: Which) {
    if (which === "discord" && discord) write(DISCORD_NEXT_KEY, String(Date.now() + discord.repeatMinutes * 60_000));
    if (which === "practice" && practice) write(PRACTICE_NEXT_KEY, String(Date.now() + practice.repeatMinutes * 60_000));
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
        onClose={() => closed("phone")}
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
        onClose={() => closed("discord")}
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
        onClose={() => closed("practice")}
      />
    );
  }
  return null;
}

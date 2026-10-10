"use client";

import { useEffect, useRef, useState } from "react";
import { IosBanner, type BannerCloseReason } from "@/components/ui/IosBanner";

const PHONE_DAY_KEY = "bnp-phone-banner-day";
const DISCORD_NEXT_KEY = "bnp-discord-banner-next";

export interface TopBannersProps {
  /** Ask for a phone number. Null when nobody should be asked. */
  phone: { seconds: number; verifying: boolean } | null;
  /** Ask to connect Discord. Null when nobody should be asked. */
  discord: { seconds: number; repeatMinutes: number } | null;
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
 * The banners at the top of the app, one at a time. The phone banner comes at most once per calendar day they visit.
 * The Discord banner comes back `repeatMinutes` after it was last shown for as long as they have not connected,
 * checked while the page stays open, and only while the tab is visible. The phone banner goes first when both are due.
 */
export function TopBanners({ phone, discord }: TopBannersProps) {
  const [active, setActive] = useState<"phone" | "discord" | null>(null);
  const activeRef = useRef<"phone" | "discord" | null>(null);
  const propsRef = useRef({ phone, discord });
  propsRef.current = { phone, discord };

  function show(which: "phone" | "discord") {
    activeRef.current = which;
    setActive(which);
  }

  useEffect(() => {
    function check() {
      if (activeRef.current || document.visibilityState !== "visible") return;
      const { phone: p, discord: d } = propsRef.current;
      if (p && read(PHONE_DAY_KEY) !== today()) {
        write(PHONE_DAY_KEY, today());
        return show("phone");
      }
      if (d && Date.now() >= Number(read(DISCORD_NEXT_KEY) ?? 0)) show("discord");
    }
    // A beat after the page settles, so a banner does not land on top of the page loading in.
    const first = setTimeout(check, 1500);
    const again = setInterval(check, 15000);
    return () => {
      clearTimeout(first);
      clearInterval(again);
    };
  }, []);

  function closed(which: "phone" | "discord", _reason: BannerCloseReason) {
    // Whatever way it went away, the Discord banner is due again after the wait.
    if (which === "discord" && discord) write(DISCORD_NEXT_KEY, String(Date.now() + discord.repeatMinutes * 60_000));
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
        onClose={(r) => closed("phone", r)}
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
        onClose={(r) => closed("discord", r)}
      />
    );
  }
  return null;
}

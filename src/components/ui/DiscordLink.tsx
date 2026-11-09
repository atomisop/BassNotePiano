"use client";

import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";

/**
 * Phones and tablets open a plain https Discord link in the browser login page. The discord:// address opens the
 * Discord app straight away. If the app does not take over within a moment, the web page is opened as before.
 */
function onTouchDevice(): boolean {
  const ua = navigator.userAgent;
  // iPad Safari reports itself as a Mac, so it is told apart by its touch screen.
  return /iPhone|iPad|iPod|Android/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function discordAppAddress(httpsUrl: string): string | null {
  try {
    const u = new URL(httpsUrl);
    if (u.hostname === "discord.gg") return `discord://discord.com/invite${u.pathname}`;
    if (u.hostname === "discord.com" || u.hostname === "www.discord.com") return `discord://discord.com${u.pathname}${u.search}`;
  } catch {
    // fall through
  }
  return null;
}

export function openInDiscord(httpsUrl: string) {
  const app = onTouchDevice() ? discordAppAddress(httpsUrl) : null;
  if (!app) {
    window.location.href = httpsUrl;
    return;
  }
  let left = false;
  const mark = () => {
    left = true;
  };
  document.addEventListener("visibilitychange", mark, { once: true });
  window.addEventListener("pagehide", mark, { once: true });
  window.location.href = app;
  setTimeout(() => {
    if (!left && !document.hidden) window.location.href = httpsUrl;
  }, 1600);
}

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick"> & { href: string; children: ReactNode };

/** A link to Discord that opens the app on a phone or iPad. Elsewhere it behaves like a normal link. */
export function DiscordLink({ href, children, ...rest }: Props) {
  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (!onTouchDevice() || !discordAppAddress(href)) return;
    e.preventDefault();
    openInDiscord(href);
  }
  return (
    <a href={href} onClick={onClick} {...rest}>
      {children}
    </a>
  );
}

/** The Connect Discord button: asks the server for this person's sign-in address, then opens it in the app. */
export function DiscordConnectLink({
  href = "/api/discord/connect",
  children,
  onClick: after,
  ...rest
}: Omit<Props, "href"> & { href?: string; onClick?: () => void }) {
  async function onClick(e: MouseEvent<HTMLAnchorElement>) {
    after?.();
    if (!onTouchDevice()) return;
    e.preventDefault();
    try {
      const res = await fetch(`${href}${href.includes("?") ? "&" : "?"}format=json`, { credentials: "same-origin" });
      const data = (await res.json()) as { url?: string };
      if (!res.ok || !data.url) throw new Error("no url");
      openInDiscord(data.url);
    } catch {
      window.location.href = href;
    }
  }
  return (
    <a href={href} onClick={onClick} {...rest}>
      {children}
    </a>
  );
}

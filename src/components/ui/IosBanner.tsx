"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { DiscordConnectLink } from "@/components/ui/DiscordLink";

/**
 * A notification banner in the style of the iPhone's: it drops in from the top edge over everything, sits on frosted
 * glass with the app icon, name and a "now" stamp, is one big tap target, has the little grab bar at the bottom, and
 * swipes up to go away. It closes itself after `seconds`. `onClose` always runs once when it is gone, whether it timed
 * out, was swiped away, was dismissed or was tapped (`reason` says which).
 */
export type BannerCloseReason = "timeout" | "dismissed" | "tapped";

const TAP_CLASS = "block rounded-[26px] px-4 pb-5 pt-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal";

/** A normal link inside the app, a plain one for the /api routes (they redirect off the site, so they must not be prefetched). */
function Tap({ href, onClick, children }: { href: string; onClick: () => void; children: React.ReactNode }) {
  if (href === "/api/discord/connect") {
    return (
      <DiscordConnectLink href={href} onClick={onClick} className={TAP_CLASS}>
        {children}
      </DiscordConnectLink>
    );
  }
  if (href.startsWith("/api/")) {
    return (
      <a href={href} onClick={onClick} className={TAP_CLASS}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} onClick={onClick} className={TAP_CLASS}>
      {children}
    </Link>
  );
}

export function IosBanner({
  title,
  body,
  href,
  seconds,
  onClose,
}: {
  title: string;
  body: string;
  /** Where a tap on the banner goes. */
  href: string;
  seconds: number;
  onClose: (reason: BannerCloseReason) => void;
}) {
  const [shown, setShown] = useState(false);
  const [drag, setDrag] = useState(0);
  const closing = useRef(false);
  const startY = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  function close(reason: BannerCloseReason) {
    if (closing.current) return;
    closing.current = true;
    setShown(false);
    setDrag(0);
    // Let the slide-up finish before the banner is removed.
    setTimeout(() => onCloseRef.current(reason), 280);
  }

  // The Atom greeting bubble waits while a banner is on screen, so the two never overlap.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("bnp:top-banner", { detail: true }));
    return () => {
      window.dispatchEvent(new CustomEvent("bnp:top-banner", { detail: false }));
    };
  }, []);

  // Slide in a beat after mounting so the transition has a starting point, and leave on time.
  useEffect(() => {
    const enter = setTimeout(() => setShown(true), 30);
    const leave = setTimeout(() => close("timeout"), seconds * 1000);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close("dismissed");
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(enter);
      clearTimeout(leave);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds]);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center px-2"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.5rem)" }}
    >
      <div
        role="status"
        aria-live="polite"
        onPointerDown={(e) => {
          startY.current = e.clientY;
        }}
        onPointerMove={(e) => {
          if (startY.current === null) return;
          setDrag(Math.min(0, e.clientY - startY.current));
        }}
        onPointerUp={() => {
          if (drag < -24) close("dismissed");
          else setDrag(0);
          startY.current = null;
        }}
        onPointerCancel={() => {
          startY.current = null;
          setDrag(0);
        }}
        className="pointer-events-auto relative w-[min(26rem,calc(100vw-1rem))] touch-pan-x select-none rounded-[26px] border border-white/30 bg-[rgb(var(--neu-base)/0.8)] shadow-[0_12px_40px_rgb(0_0_0/0.28)] backdrop-blur-2xl backdrop-saturate-150 motion-reduce:transition-none"
        style={{
          transform: shown ? `translateY(${drag}px)` : "translateY(-140%)",
          opacity: shown ? 1 : 0,
          transition: startY.current !== null ? "none" : "transform 460ms cubic-bezier(0.22, 1.25, 0.36, 1), opacity 200ms ease",
        }}
      >
        <Tap href={href} onClick={() => close("tapped")}>
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.png" alt="" width={20} height={20} className="h-5 w-5 rounded-[6px] object-cover" />
            <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">Bass Note Piano</span>
            <span className="ml-auto text-[12px] text-slate-500 [@media(hover:hover)]:mr-7">now</span>
          </div>
          <p className="mt-1.5 text-[15px] font-semibold leading-snug text-slate-100">{title}</p>
          <p className="text-[15px] leading-snug text-slate-300">{body}</p>
        </Tap>
        {/* The grab bar, like the one under a banner on an iPhone. */}
        <span aria-hidden className="pointer-events-none absolute bottom-1.5 left-1/2 h-[5px] w-9 -translate-x-1/2 rounded-full bg-slate-500/50" />
        <button
          type="button"
          onClick={() => close("dismissed")}
          aria-label="Dismiss"
          className="hit-slop absolute right-2 top-2 hidden h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-500/20 hover:text-slate-200 [@media(hover:hover)]:flex"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

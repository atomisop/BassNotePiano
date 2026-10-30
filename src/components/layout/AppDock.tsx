"use client";

import { GlassLens } from "@/components/ui/GlassLens";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { useUnreadMessages } from "@/lib/useUnreadMessages";
import { onChange } from "@/lib/liveEvents";
import { SCROLL_TOP_EVENT } from "@/components/layout/ScrollAssist";
import { NAV_PENDING_EVENT } from "@/components/layout/NavPendingGate";

// Same 30s cadence as NotificationBell's own poll, which this mirrors.
const POLL_INTERVAL_MS = 30_000;

// The dock's own icon set: one 24pt grid, one 2pt rounded stroke, so the five read as a family the way Instagram's do. The tab you
// are on is drawn filled: `fill` is the solid shape, `cut` is detail punched back out of it in the capsule's color (the map's folds,
// the calendar's line and check, the gear's hole).
type DockGlyph = { outline: string[]; fill?: string; cut?: string; /** The cut-out is a solid hole (the gear) rather than lines. */ cutSolid?: boolean; rings?: string };
const GEAR =
  "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z";
const MAP =
  "M14.1 5.55a2 2 0 0 0 1.8 0l3.65-1.83A1 1 0 0 1 21 4.62v12.76a1 1 0 0 1-.55.9l-4.55 2.27a2 2 0 0 1-1.8 0l-4.2-2.1a2 2 0 0 0-1.8 0l-3.65 1.83A1 1 0 0 1 3 19.38V6.62a1 1 0 0 1 .55-.9L8.1 3.45a2 2 0 0 1 1.8 0z";
const HOUSE = "M3.5 10.4 12 3.6l8.5 6.8V19a1.75 1.75 0 0 1-1.75 1.75H15v-5a1.25 1.25 0 0 0-1.25-1.25h-3.5A1.25 1.25 0 0 0 9 15.75v5H5.25A1.75 1.75 0 0 1 3.5 19z";
const BUBBLE =
  "M12 3.6c4.8 0 8.6 3.4 8.6 7.7S16.8 19 12 19c-1.1 0-2.15-.18-3.12-.5L4.4 20.2l1.25-3.65C4.3 15.2 3.4 13.35 3.4 11.3 3.4 7 7.2 3.6 12 3.6z";
// The owner's Admin tab: a shield with a check (the usual sign for "admin"), so it is not mistaken for an overview grid.
const SHIELD = "M12 3.25 19.25 6v5.6c0 4.45-3 8.2-7.25 9.65C7.75 19.8 4.75 16.05 4.75 11.6V6z";
const SHIELD_CHECK = "M8.9 12.1l2.15 2.15 4.05-4.05";
const DOCK_GLYPHS: Record<string, DockGlyph> = {
  home: { outline: [HOUSE], fill: HOUSE },
  roadmap: {
    outline: [MAP, "M9 3.5v14.6M15 5.9v14.6"],
    fill: MAP,
    cut: "M9 3.5v14.6M15 5.9v14.6",
  },
  lessons: {
    outline: ["M6.75 4.75h10.5a3 3 0 0 1 3 3v9.5a3 3 0 0 1-3 3H6.75a3 3 0 0 1-3-3v-9.5a3 3 0 0 1 3-3z", "M3.75 9.75h16.5M8 3v3.5M16 3v3.5M9.25 14.75l1.9 1.9 3.6-3.6"],
    fill: "M6.75 4.75h10.5a3 3 0 0 1 3 3v9.5a3 3 0 0 1-3 3H6.75a3 3 0 0 1-3-3v-9.5a3 3 0 0 1 3-3z",
    cut: "M3.75 9.75h16.5M9.25 14.75l1.9 1.9 3.6-3.6",
    rings: "M8 3v3.5M16 3v3.5",
  },
  messages: { outline: [BUBBLE], fill: BUBBLE },
  admin: { outline: [SHIELD, SHIELD_CHECK], fill: SHIELD, cut: SHIELD_CHECK },
  settings: { outline: [GEAR, "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"], fill: GEAR, cut: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", cutSolid: true },
};

function DockGlyphIcon({ glyph, active }: { glyph: DockGlyph; active: boolean }) {
  const line = { stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const filled = active && glyph.fill;
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" className="h-[25px] w-[25px]">
      {filled ? (
        <>
          <path d={glyph.fill} fill="currentColor" {...line} />
          {glyph.cut && <path d={glyph.cut} {...line} stroke="var(--dock-cut)" fill={glyph.cutSolid ? "var(--dock-cut)" : "none"} />}
          {/* The calendar's rings sit above the filled body and stay lines. */}
          {glyph.rings && <path d={glyph.rings} {...line} />}
        </>
      ) : (
        glyph.outline.map((d, i) => <path key={i} d={d} {...line} strokeWidth={active ? 2.4 : 2} />)
      )}
    </svg>
  );
}

// How close the cursor has to get to the bottom edge to reveal a hidden
// dock, and how long it lingers after the cursor leaves before hiding
// again. Tall enough that hovering the dock itself (including a magnified
// icon poking up toward the panel's own max height) never dips outside this
// zone and causes a flicker-hide mid-interaction.

export interface AppDockProps {
  unreadMessageCount: number;
  /** The owner's own dock (2026-10-30, by their request): Admin takes Messages' place. Messages is still in the sidebar and menu. */
  ownerAdmin?: boolean;
}

// "About" and "Sign out" live inside Settings now, not as dock icons,
// pinned to the bottom of its nav there, always. "Profile" moved to the
// TopBar as the user's own avatar photo, next to the notification bell.
// "Admin" moved there too, by direct instruction, next to the
// notification bell rather than a sixth dock icon (see TopBar.tsx), since
// it's a role-gated destination for the one admin account, not an
// everyday nav item every signed-in visitor taps.
//
// No "More" overflow, on any width: it briefly existed for mobile, but once
// About/Sign-out moved into Settings, Settings was the only thing it was
// still gatekeeping, every real destination (Lessons included) was already
// a direct icon. An overflow menu hiding exactly one item, itself the
// gateway to the other two, wasn't earning its tap. Same five items,
// mobile and desktop alike, admin or not.
// `dataTour` values are OnboardingTour's hooks (see tourSteps.ts), they
// used to live on Sidebar/MobileTabBar, both now unused. Carrying them over
// here is what keeps the tour actually pointing at real, on-screen buttons
// instead of silently skipping almost every step (`findVisibleTarget`
// treats a missing/invisible target as "skip this one").
const NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/roadmap", label: "Roadmap", icon: "roadmap", dataTour: "nav-roadmap" },
  { href: "/lessons", label: "Online Lessons", icon: "lessons", dataTour: "nav-lessons" },
  { href: "/messages", label: "Messages", icon: "messages", dataTour: "nav-messages" },
  { href: "/account", label: "Settings", icon: "settings", dataTour: "nav-settings" },
] as const;
const OWNER_NAV_ITEMS = NAV_ITEMS.map((item) => (item.href === "/messages" ? { href: "/admin", label: "Admin", icon: "admin" } : item));

/**
 * The app's only bottom navigation now, at every breakpoint, a floating
 * dock, replacing both the old vertical `Sidebar` rail (desktop) and
 * `MobileTabBar` (phone). Both old files are still in the tree, used by
 * nothing, kept only because deleting them wasn't asked for. Same routes,
 * same active-state and unread-badge logic either one had.
 *
 * The magnify choreography is mouse-only (see `dock.tsx`), real mouse,
 * specifically. It briefly also responded to touch (a finger held and
 * dragged drove the same curve a mouse move does), which stuck a magnified
 * icon in place whenever a tap's navigation cut the touch gesture off
 * before its own `touchend` arrived. Removing just the touch handlers
 * wasn't enough on a real device, though: touchscreens still fire a
 * synthetic compatibility "mousemove" ~300ms after a tap lifts, and that
 * was reaching the plain `onMouseMove` left behind, reintroducing the same
 * stuck-magnify bug through the mouse path instead. `dock.tsx` now uses
 * Pointer Events and checks `pointerType === 'mouse'` explicitly, which is
 * the one place the browser says what really generated the event, so
 * touch (real or synthesized) never engages the effect at all, mobile/
 * tablet gets a plain, reliable tap with no growth effect, by direct
 * instruction.
 *
 * Each icon is real navigation, not the demo's decorative circles: `Link`
 * wraps the outside of `DockItem` rather than living inside it, since
 * `DockItem` clones its direct children to inject the shared hover width,
 * putting `Link` inside would make the clone target the anchor instead of
 * `DockIcon`.
 *
 * Icon-only, no caption under each icon, by direct instruction ("remove
 * the texts from the dock"). `aria-label` on both `Link` and `DockItem`
 * still carries each destination's real name for a screen reader; only the
 * always-visible printed caption is gone. See the `NAV_ITEMS.map` below for
 * what replaced the caption's old job of marking which tab is active, a
 * spotlight glow plus a thin top line, not a label treatment at all.
 *
 * The dock is always on screen, on every device (it used to slide away on a desktop mouse and reappear near the bottom edge).
 * The page reserves room under it so it never covers content (see the main area padding in `(dashboard)/layout.tsx`).
 */
export function AppDock({ unreadMessageCount: initialUnreadMessageCount, ownerAdmin = false }: AppDockProps) {
  const items = ownerAdmin ? OWNER_NAV_ITEMS : NAV_ITEMS;
  const pathname = usePathname();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  // The tab just tapped lights up at once, before the new page has arrived.
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  useEffect(() => setPendingHref(null), [pathname]);
  // Every tab is fetched ahead of the tap, so the move is instant.
  useEffect(() => {
    for (const item of items) router.prefetch(item.href);
  }, [router, items]);
  // The unread badge: the server's count at page load, then the shared live status (one poll a minute for the whole app, a look on every
  // page change and every "messages" announcement), the same one the sidebar uses. It used to run its own timer.
  const unreadMessageCount = useUnreadMessages(initialUnreadMessageCount);

  // Like Instagram's bar: scrolling down narrows the pill (same height, icons closer together); scrolling up or reaching the top
  // widens it again. Only the page's own scroller (<main>) counts, not a list scrolling inside a page.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    let last = 0;
    const onScroll = (e: Event) => {
      const el = e.target;
      if (!(el instanceof HTMLElement) || el.tagName !== "MAIN") return;
      const top = el.scrollTop;
      if (top < 24) setNarrow(false);
      else if (top - last > 6) setNarrow(true);
      else if (last - top > 6) setNarrow(false);
      last = top;
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, []);
  useEffect(() => setNarrow(false), [pathname]);

  // Opening a chat focuses its input, and iOS Safari answers by scrolling the
  // whole document to keep the input above the keyboard. The shell is a fixed
  // 100svh and never scrolls itself, so that document offset sticks after the
  // keyboard closes (or after navigating away) and exposes the page ground as
  // a strip under the dock. Snap the document back whenever the route changes
  // or an input loses focus.
  useEffect(() => {
    const reset = () => {
      if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0);
    };
    reset();
    window.addEventListener("focusout", reset);
    window.visualViewport?.addEventListener("resize", reset);
    return () => {
      window.removeEventListener("focusout", reset);
      window.visualViewport?.removeEventListener("resize", reset);
    };
  }, [pathname]);


  return (
    <div
      role="navigation"
      aria-label="Primary"
      className="kb-hide pointer-events-none fixed inset-x-0 bottom-[max(1.25rem,calc(env(safe-area-inset-bottom)-0.25rem))] z-40 flex justify-center px-5"
    >
      {/* A copy of Instagram's floating tab bar: a 53pt glass pill 20pt from the edges, five icon slots with no names, and a lighter
          capsule behind the tab you are on that slides to the next one. The page under it is frosted (you see color and shape, not
          words) and bends at the rim. Colors come from .app-dock in globals.css, one set per theme. */}
      {/* Scrolling down shrinks the whole dock (both ways, toward the bottom) and scrolling back up grows it again, on a spring so it
          overshoots a touch, like the dock first did. */}
      <motion.div
        data-glass=""
        initial={false}
        animate={{ scale: narrow ? 0.84 : 1, y: narrow ? 6 : 0 }}
        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 22, mass: 0.9 }}
        style={{ transformOrigin: "50% 100%" }}
        className="app-dock app-dock-lens pointer-events-auto relative grid h-[53px] w-full max-w-[26rem] grid-cols-5 items-center rounded-full px-[5px] py-[5px]"
      >
        {/* A flat frosted pane: a pill like the dock, a thin edge and a gentle bend, so it reads as matte glass, not a bulge. */}
        <GlassLens radius="full" bezel={6} strength={4} magnify={0} blur={14} />
        {items.map((item) => {
          const at = pendingHref ?? pathname;
          // A scale's page belongs to the Roadmap tab.
          const active =
            at === item.href || (item.href === "/roadmap" && at.startsWith("/scales/")) || (item.href === "/admin" && at.startsWith("/admin/"));
          const current = pathname === item.href;
          const badge = item.href === "/messages" ? unreadMessageCount : 0;
          const glyph = DOCK_GLYPHS[item.icon];
          return (
            <Link
              key={item.href}
              href={item.href}
              data-prerender={item.href === "/messages" ? undefined : ""}
              aria-label={badge ? `${item.label}, ${badge} unread` : item.label}
              aria-current={current ? "page" : undefined}
              // The current tab again means "take me to the top" (it would only reload the same page).
              onClick={
                current
                  ? (e) => {
                      e.preventDefault();
                      window.dispatchEvent(new Event(SCROLL_TOP_EVENT));
                    }
                  : () => {
                      setPendingHref(item.href);
                      window.dispatchEvent(new CustomEvent(NAV_PENDING_EVENT, { detail: item.href }));
                    }
              }
              data-tour={"dataTour" in item ? item.dataTour : undefined}
              className="tap relative flex h-full items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {active && (
                <motion.span
                  layoutId="dock-active-pill"
                  transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 30, mass: 0.9 }}
                  className="app-dock-active pointer-events-none absolute -inset-x-0.5 inset-y-0 rounded-full"
                />
              )}
              <motion.span
                // Springs, not a timed keyframe list: tapping another tab mid-bounce takes over from where the icon is, instead of finishing or snapping.
                whileTap={{ scale: 0.82 }}
                transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 20, mass: 0.7 }}
                className={`dock-icon relative flex h-6 w-6 items-center justify-center ${active ? "text-slate-50" : "text-slate-200"}`}
              >
                <DockGlyphIcon glyph={glyph} active={active} />
                {Boolean(badge) && <span className="pointer-events-none absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#ff3040]" />}
              </motion.span>

            </Link>
          );
        })}
      </motion.div>
    </div>
  );
}

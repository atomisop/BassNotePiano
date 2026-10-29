"use client";

import { GlassLens } from "@/components/ui/GlassLens";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Home, CalendarCheck, Users, MessageSquare, Settings, type LucideIcon } from "lucide-react";
import { useUnreadMessages } from "@/lib/useUnreadMessages";
import { onChange } from "@/lib/liveEvents";
import { SCROLL_TOP_EVENT } from "@/components/layout/ScrollAssist";
import { NAV_PENDING_EVENT } from "@/components/layout/NavPendingGate";

// Same 30s cadence as NotificationBell's own poll, which this mirrors.
const POLL_INTERVAL_MS = 30_000;

// Swapped from the hand-drawn NavIcon/ICON_PATHS set (still used elsewhere,
// see navIcons.tsx) to lucide-react for this dock specifically, by direct
// instruction.
const NAV_ICON: Record<string, LucideIcon> = {
  home: Home,
  lessons: CalendarCheck,
  friends: Users,
  messages: MessageSquare,
  settings: Settings,
};

// How close the cursor has to get to the bottom edge to reveal a hidden
// dock, and how long it lingers after the cursor leaves before hiding
// again. Tall enough that hovering the dock itself (including a magnified
// icon poking up toward the panel's own max height) never dips outside this
// zone and causes a flicker-hide mid-interaction.

export interface AppDockProps {
  unreadMessageCount: number;
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
  { href: "/dashboard", label: "Home", icon: "home", dataTour: "nav-roadmap" },
  { href: "/lessons", label: "Online Lessons", icon: "lessons", dataTour: "nav-lessons" },
  { href: "/friends", label: "Friends", icon: "friends", dataTour: "nav-friends" },
  { href: "/messages", label: "Messages", icon: "messages", dataTour: "nav-messages" },
  { href: "/account", label: "Settings", icon: "settings", dataTour: "nav-settings" },
] as const;

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
export function AppDock({ unreadMessageCount: initialUnreadMessageCount }: AppDockProps) {
  const pathname = usePathname();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  // The tab just tapped lights up at once, before the new page has arrived.
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  useEffect(() => setPendingHref(null), [pathname]);
  // Every tab is fetched ahead of the tap, so the move is instant.
  useEffect(() => {
    for (const item of NAV_ITEMS) router.prefetch(item.href);
  }, [router]);
  // Scrolling down tucks the dock into a smaller pill; scrolling back up (or reaching the top) opens it again.
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const lastTop = new WeakMap<EventTarget, number>();
    const onScroll = (e: Event) => {
      const el = e.target;
      // Only the app's own page scroller (<main>): a list scrolling inside a page should not move the dock.
      if (!(el instanceof HTMLElement) || el.tagName !== "MAIN") return;
      const top = el.scrollTop;
      const prev = lastTop.get(el) ?? top;
      lastTop.set(el, top);
      const delta = top - prev;
      if (top < 24) setCompact(false);
      else if (delta > 6) setCompact(true);
      else if (delta < -6) setCompact(false);
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, []);

  // A new page starts at the top, with the dock open.
  useEffect(() => setCompact(false), [pathname]);

  // The unread badge: the server's count at page load, then the shared live status (one poll a minute for the whole app, a look on every
  // page change and every "messages" announcement), the same one the sidebar uses. It used to run its own timer.
  const unreadMessageCount = useUnreadMessages(initialUnreadMessageCount);

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
      {/* The Instagram-style floating pill: about 53pt tall, 20pt in from each side on a phone (capped on wider screens), five equal
          slots, icons about 22pt, and a lighter capsule behind the page you are on that slides to the next one. Frosted white in the light theme, dark glass in the dark one (the colors come from the theme ramp, so they follow the mode on their own). */}
      <motion.div
        animate={{ scale: compact ? 0.82 : 1, y: compact ? 8 : 0 }}
        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 340, damping: 17, mass: 0.8 }}
        style={{ transformOrigin: "50% 100%" }}
        className="liquid-rim pointer-events-auto relative grid h-[53px] w-full max-w-[26rem] grid-cols-5 items-center rounded-full p-1 shadow-[0_14px_30px_-12px_rgb(0_0_0/0.45)]"
      >
        <GlassLens radius="full" bezel={26} strength={26} magnify={0.55} blur={1.2} />
        {NAV_ITEMS.map((item) => {
          const active = (pendingHref ?? pathname) === item.href;
          const current = pathname === item.href;
          const badge = item.href === "/messages" ? unreadMessageCount : 0;
          const Icon = NAV_ICON[item.icon];
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
              className="tap relative flex h-[45px] items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {active && (
                <motion.span
                  layoutId="dock-active-pill"
                  transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 15, mass: 0.9 }}
                  className="pointer-events-none absolute left-1/2 top-0 h-full w-[4.7rem] -translate-x-1/2 rounded-full"
                >
                  <GlassLens radius="full" bezel={14} strength={11} tint="linear-gradient(180deg, rgb(255 255 255 / 0.26), rgb(255 255 255 / 0.1))" blur={1} />
                </motion.span>
              )}
              <motion.span
                // Springs, not a timed keyframe list: tapping another tab mid-bounce takes over from where the icon is, instead of finishing or snapping.
                whileTap={{ scale: 0.82 }}
                animate={{ scale: active && !reduceMotion ? 1.14 : 1 }}
                transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 14, mass: 0.7 }}
                className="relative flex h-[22px] w-[22px] items-center justify-center"
              >
                <Icon
                  aria-hidden
                  strokeWidth={active ? 2.4 : 2}
                  fill={active && item.icon === "home" ? "currentColor" : "none"}
                  className="h-[22px] w-[22px] text-slate-50"
                />
                {Boolean(badge) && <span className="pointer-events-none absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#ff3040] ring-2 ring-white dark:ring-[rgb(var(--c-s-900))]" />}
              </motion.span>
            </Link>
          );
        })}
      </motion.div>
    </div>
  );
}

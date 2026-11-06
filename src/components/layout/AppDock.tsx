"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { onChange } from "@/lib/liveEvents";
import { SCROLL_TOP_EVENT } from "@/components/layout/ScrollAssist";
import { NAV_PENDING_EVENT } from "@/components/layout/NavPendingGate";
import { COOLICONS } from "@/components/layout/coolicons";

// Same 30s cadence as NotificationBell's own poll, which this mirrors.
const POLL_INTERVAL_MS = 30_000;

// The dock's icons are coolicons (coolicons.ts, copied exactly from the published set, chosen by the owner 2026-10-31). Like Instagram's bar,
// the current tab's icon is filled: `fill` names which of the icon's own paths are solid shapes, and `cut` which are its inner details,
// drawn over the fill in the capsule's color (the shield's check, the gear's center). Icons whose drawing is open lines (the map, the
// calendar) cannot be filled without redrawing them, so they get a bolder line instead.
type DockIcon = { paths: string[]; fill?: number[]; cut?: number[] };
// coolicons' shield-check is one path, the check first ("m15 9l-4 4l-2-2") then the shield, which starts where the check ends plus
// "m11-.835", that is at (20, 10.165). Split at that point, unchanged, so the shield can be filled under its check.
const SHIELD_CHECK = COOLICONS.admin.paths[0];
const SHIELD_SPLIT = SHIELD_CHECK.indexOf("m11-.835");
const DOCK_ICONS: Record<string, DockIcon> = {
  home: { paths: COOLICONS.home.paths, fill: [0] },
  roadmap: { paths: COOLICONS.roadmap.paths },
  lessons: { paths: COOLICONS.lessons.paths },
  friends: { paths: COOLICONS.friends.paths },
  admin: { paths: [`M20 10.165${SHIELD_CHECK.slice(SHIELD_SPLIT + "m11-.835".length)}`, SHIELD_CHECK.slice(0, SHIELD_SPLIT)], fill: [0], cut: [1] },
  settings: { paths: COOLICONS.settings.paths, fill: [0], cut: [1] },
};

function DockGlyphIcon({ icon, active }: { icon: DockIcon; active: boolean }) {
  const line = { fill: "none", stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const filled = active && Boolean(icon.fill?.length);
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={`h-[26px] w-[26px] origin-center transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${active ? "scale-[1.14]" : ""}`}>
      {icon.paths.map((d, i) =>
        filled && icon.fill?.includes(i) ? (
          <path key={i} d={d} {...line} fill="currentColor" strokeWidth={2} />
        ) : filled && icon.cut?.includes(i) ? (
          <path key={i} d={d} {...line} stroke="var(--dock-cut)" strokeWidth={2} />
        ) : (
          <path key={i} d={d} {...line} strokeWidth={active ? 2.5 : 2} />
        ),
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
  /** An admin's dock: Admin takes Friends' place. Friends stays in the top bar and the profile menu for them. */
  isAdmin?: boolean;
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
  { href: "/lessons", label: "Lessons", icon: "lessons", dataTour: "nav-lessons" },
  { href: "/friends", label: "Friends", icon: "friends", dataTour: "nav-friends" },
  { href: "/account", label: "Settings", icon: "settings", dataTour: "nav-settings" },
] as const;
const ADMIN_NAV_ITEMS = NAV_ITEMS.map((item) => (item.href === "/friends" ? { href: "/admin", label: "Admin", icon: "admin" } : item));

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
export function AppDock({ isAdmin = false }: AppDockProps) {
  const items = isAdmin ? ADMIN_NAV_ITEMS : NAV_ITEMS;
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
  // Like Instagram's bar: scrolling down shrinks the pill in both directions; scrolling up or reaching the top brings it back. Only the page's own scroller (<main>) counts, not a list scrolling inside a page.
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
      className="kb-hide pointer-events-none fixed inset-x-0 bottom-[max(1.25rem,calc(env(safe-area-inset-bottom)-0.25rem))] z-40 flex justify-center px-[22px]"
    >
      {/* An exact copy of Instagram's floating tab bar (measured from the owner's screenshots, 2026-10-31): a 58pt pill 22pt from the
          screen edges, a dark smoky tint over a heavy frost with a bright glass rim, five icon slots 10pt in from the ends, and an
          82 by 50pt light capsule behind the current tab that slides to the next one. Colors in .ig-dock in globals.css, one set per theme. */}
      <div
        // Scrolling down shrinks the whole pill (both ways, like Instagram's), anchored at the bottom so it stays above the home bar.
        style={{
          transform: narrow ? "scale(0.84)" : "scale(1)",
          transformOrigin: "50% 100%",
          transition: reduceMotion ? undefined : "transform 420ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
        className="ig-dock pointer-events-auto relative grid h-[58px] w-full max-w-[26rem] grid-cols-5 items-center rounded-full px-[10px] py-[4px]"
      >
        {items.map((item) => {
          const at = pendingHref ?? pathname;
          // A scale's page belongs to the Roadmap tab.
          const active =
            at === item.href || (item.href === "/roadmap" && at.startsWith("/scales/")) || (item.href === "/admin" && at.startsWith("/admin/"));
          const current = pathname === item.href;
          const icon = DOCK_ICONS[item.icon];
          return (
            <Link
              key={item.href}
              href={item.href}
              data-prerender=""
              aria-label={item.label}
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
                  transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 24, mass: 0.9 }}
                  className="ig-dock-active pointer-events-none absolute -inset-x-[6px] -inset-y-[7px] rounded-full"
                />
              )}
              <motion.span
                // Springs, not a timed keyframe list: tapping another tab mid-bounce takes over from where the icon is, instead of finishing or snapping.
                whileTap={{ scale: 0.82 }}
                transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 20, mass: 0.7 }}
                className={`ig-dock-icon relative flex h-[26px] w-[26px] items-center justify-center ${active ? "is-on" : ""}`}
              >
                <DockGlyphIcon icon={icon} active={active} />
              </motion.span>

            </Link>
          );
        })}
      </div>
    </div>
  );
}

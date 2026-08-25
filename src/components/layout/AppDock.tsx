"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Dock, DockIcon, DockItem } from "@/components/ui/dock";
import { NavIcon, ICON_PATHS } from "./navIcons";

// How close the cursor has to get to the bottom edge to reveal a hidden
// dock, and how long it lingers after the cursor leaves before hiding
// again. Tall enough that hovering the dock itself (including a magnified
// icon poking up toward the panel's own max height) never dips outside this
// zone and causes a flicker-hide mid-interaction.
const REVEAL_ZONE_PX = 170;
const HIDE_DELAY_MS = 500;

/**
 * iPad and iPhone, specifically excluded from auto-hide even when they'd
 * otherwise pass the `hover: hover` check below. iPadOS reports a real
 * `(hover: hover)` match whenever a trackpad or Magic Keyboard is attached,
 * since its cursor genuinely does hover, so the capability query alone
 * would treat a trackpad-equipped iPad as "a PC," the opposite of what was
 * asked for. iPadOS 13+ also disguises `navigator.platform` as "MacIntel"
 * (so sites don't serve it a cut-down mobile layout), which is why this
 * checks `maxTouchPoints` rather than platform alone: a real Mac reports 0
 * touch points, an iPad reports several, regardless of what's plugged in.
 */
function isAppleTouchDevice(): boolean {
  const iOSByUserAgent = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const iPadOS13Plus = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOSByUserAgent || iPadOS13Plus;
}

export interface AppDockProps {
  isAdmin: boolean;
  unreadMessageCount: number;
}

// "About" and "Sign out" live inside Settings now, not as dock icons —
// pinned to the bottom of its nav there, always. "Profile" moved to the
// TopBar as the user's own avatar photo, next to the notification bell.
//
// No "More" overflow, on any width: it briefly existed for mobile, but once
// About/Sign-out moved into Settings, Settings was the only thing it was
// still gatekeeping — every real destination (Lessons included) was already
// a direct icon. An overflow menu hiding exactly one item, itself the
// gateway to the other two, wasn't earning its tap. Same five items,
// mobile and desktop alike.
// `dataTour` values are OnboardingTour's hooks (see tourSteps.ts) — they
// used to live on Sidebar/MobileTabBar, both now unused. Carrying them over
// here is what keeps the tour actually pointing at real, on-screen buttons
// instead of silently skipping almost every step (`findVisibleTarget`
// treats a missing/invisible target as "skip this one").
const NAV_ITEMS = [
  { href: "/dashboard", label: "Roadmap", icon: ICON_PATHS.roadmap, dataTour: "nav-roadmap" },
  { href: "/lessons", label: "Online Lessons", icon: ICON_PATHS.lessons, dataTour: "nav-lessons" },
  { href: "/friends", label: "Friends", icon: ICON_PATHS.friends, dataTour: "nav-friends" },
  { href: "/messages", label: "Messages", icon: ICON_PATHS.messages, dataTour: "nav-messages" },
  { href: "/account", label: "Settings", icon: ICON_PATHS.settings, dataTour: "nav-settings" },
];

/**
 * The app's only bottom navigation now, at every breakpoint — a floating
 * liquid-glass dock, replacing both the old vertical `Sidebar` rail (desktop)
 * and `MobileTabBar` (phone). Both old files are still in the tree, used by
 * nothing, kept only because deleting them wasn't asked for. Same routes,
 * same active-state and unread-badge logic either one had.
 *
 * The magnify choreography is mouse-only (see `dock.tsx`) — real mouse,
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
 * touch (real or synthesized) never engages the effect at all — mobile/
 * tablet gets a plain, reliable tap with no growth effect, by direct
 * instruction.
 *
 * Each icon is real navigation, not the demo's decorative circles: `Link`
 * wraps the outside of `DockItem` rather than living inside it, since
 * `DockItem` clones its direct children to inject the shared hover width —
 * putting `Link` inside would make the clone target the anchor instead of
 * `DockIcon`.
 *
 * Labels are a permanent caption under each icon, not the original demo's
 * `DockLabel` hover tooltip — a tap has no hover step to reveal one before
 * committing to the navigation. A permanent caption (same convention
 * `Sidebar`/`MobileTabBar` already used) reads for every input type, at the
 * cost of the pure hover-tooltip look the demo shipped with.
 *
 * Auto-hide, macOS-Dock style, is desktop-only: on a real mouse it slides
 * fully off-screen and reveals again only once the cursor nears the bottom
 * edge, but iPad and phone always show it solid, by direct instruction.
 * A touch device has no cursor to approach the edge with, so hiding it
 * there would mean no way back short of a page reload. Three separate
 * overrides keep it visible regardless of cursor position: focus landing on
 * something inside it (so a keyboard user's focus ring is never hidden out
 * from under them), OnboardingTour spotlighting one of its icons, and
 * `!autoHideEnabled` itself (touch devices and reduced-motion).
 */
export function AppDock({ isAdmin, unreadMessageCount }: AppDockProps) {
  const pathname = usePathname();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Auto-hide is a desktop-with-a-real-mouse thing only, by direct
  // instruction. iPad and phone keep the dock solid, and this is computed
  // from input capability (`hover`+`pointer:fine`) plus the explicit
  // isAppleTouchDevice check above, not screen width, so a touchscreen
  // laptop or a narrow desktop window still get the right answer. Defaults
  // to false (i.e. "always visible") until this runs, the same
  // safe-default-until-mounted shape SmoothScrollProvider already uses for
  // its own matchMedia check: a form of "does this device have a real
  // mouse" nobody expects to change mid-session, so read once, no live
  // `change` subscription.
  const [autoHideEnabled, setAutoHideEnabled] = useState(false);
  useEffect(() => {
    const hasMouse = window.matchMedia("(hover: hover) and (pointer: fine)").matches && !isAppleTouchDevice();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Reduced-motion opts out of the hide/reveal slide entirely, not just a
    // gentler version of it, same reasoning as SmoothScrollProvider next to
    // this: a sliding primary-nav element is exactly the motion that setting
    // exists to suppress, not something to tone down and keep anyway.
    setAutoHideEnabled(hasMouse && !reducedMotion);
  }, []);

  // Visible until proven otherwise: a page that loads and is never touched
  // keeps the dock on screen rather than yanking it away before the visitor
  // has done anything.
  const [visible, setVisible] = useState(true);
  // Two independent reasons to override the proximity logic and stay shown
  // regardless of cursor position: a keyboard user has tabbed a focus ring
  // onto something inside the dock (hiding it out from under a visible
  // focus ring would be its own bug), or OnboardingTour is mid-step and
  // might need to spotlight a nav icon (see the CustomEvent listener below).
  const [hasFocusWithin, setHasFocusWithin] = useState(false);
  const [tourForcedVisible, setTourForcedVisible] = useState(false);

  useEffect(() => {
    if (!autoHideEnabled) return;

    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const clearHideTimer = () => {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    };

    // Pointer Events, gated on pointerType === "mouse": same reasoning as
    // dock.tsx's own magnify handler. Touchscreens synthesize compatibility
    // mouse events, so filtering on the event *name* isn't enough to keep
    // this mouse-only, but pointerType is the one place the browser tells
    // the truth about what actually generated it. Listening on `window`
    // rather than a hover target means proximity to the physical bottom
    // edge reveals it, the same as the real macOS Dock, regardless of what
    // element happens to be under the cursor there.
    function handlePointerMove(e: PointerEvent) {
      if (e.pointerType !== "mouse") return;
      const nearBottom = window.innerHeight - e.clientY <= REVEAL_ZONE_PX;
      if (nearBottom) {
        clearHideTimer();
        setVisible(true);
      } else if (!hideTimer) {
        hideTimer = setTimeout(() => setVisible(false), HIDE_DELAY_MS);
      }
    }

    window.addEventListener("pointermove", handlePointerMove);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      clearHideTimer();
    };
  }, [autoHideEnabled]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const handleFocusIn = () => setHasFocusWithin(true);
    const handleFocusOut = (e: FocusEvent) => {
      if (e.relatedTarget instanceof Node && el.contains(e.relatedTarget)) return;
      setHasFocusWithin(false);
    };
    el.addEventListener("focusin", handleFocusIn);
    el.addEventListener("focusout", handleFocusOut);
    return () => {
      el.removeEventListener("focusin", handleFocusIn);
      el.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  useEffect(() => {
    const handleTourVisibility = (e: Event) => {
      setTourForcedVisible(Boolean((e as CustomEvent<boolean>).detail));
    };
    window.addEventListener("bnp:force-dock-visible", handleTourVisibility);
    return () => window.removeEventListener("bnp:force-dock-visible", handleTourVisibility);
  }, []);

  const effectivelyVisible = !autoHideEnabled || visible || hasFocusWithin || tourForcedVisible;

  const items = isAdmin
    ? [...NAV_ITEMS, { href: "/admin/payments", label: "Admin", icon: ICON_PATHS.admin }]
    : NAV_ITEMS;

  return (
    <div
      role="navigation"
      aria-label="Primary"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center pb-[env(safe-area-inset-bottom)]"
    >
      <motion.div
        ref={wrapperRef}
        className="pointer-events-auto"
        animate={{ y: effectivelyVisible ? 0 : "calc(100% + 24px)", opacity: effectivelyVisible ? 1 : 0 }}
        transition={{ type: "spring", bounce: 0, duration: 0.35 }}
      >
        <Dock className="items-end pb-3" magnification={72} distance={140} panelHeight={60}>
          {items.map((item) => {
            const active = pathname === item.href || (item.href === "/admin/payments" && pathname.startsWith("/admin"));
            const badge = item.href === "/messages" ? unreadMessageCount : 0;

            return (
              // Badge lives on this wrapper, not inside `DockItem` — that
              // component clones its direct children unconditionally (see
              // dock.tsx), so a third, sometimes-`false` child there
              // crashes it. `DockItem` gets exactly one static child
              // (`DockIcon`), always; the caption sits outside it entirely.
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                data-tour={"dataTour" in item ? item.dataTour : undefined}
                className="relative flex flex-col items-center gap-1"
              >
                <DockItem
                  aria-label={item.label}
                  className={`rounded-full transition-colors ${
                    active ? "bg-[rgb(var(--c-a-400)/0.18)]" : "hover:bg-[rgb(var(--c-s-50)/0.08)]"
                  }`}
                >
                  <DockIcon>
                    <NavIcon
                      path={item.icon}
                      className={`h-full w-full ${active ? "text-[rgb(var(--c-a-300))]" : "text-[rgb(var(--c-s-300))]"}`}
                    />
                  </DockIcon>
                </DockItem>
                <span
                  className={`text-[9px] font-medium leading-none ${active ? "text-[rgb(var(--c-a-300))]" : "text-[rgb(var(--c-s-400))]"}`}
                >
                  {item.label}
                </span>
                {Boolean(badge) && (
                  <span className="pointer-events-none absolute right-1 top-1 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-[rgb(var(--c-a-400))] px-1 text-[9px] font-bold text-slate-950">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </Link>
            );
          })}
        </Dock>
      </motion.div>
    </div>
  );
}

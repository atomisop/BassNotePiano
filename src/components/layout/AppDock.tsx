"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Home, CalendarCheck, Users, MessageSquare, Settings, type LucideIcon } from "lucide-react";
import { Dock, DockIcon, DockItem } from "@/components/ui/dock";

// Swapped from the hand-drawn NavIcon/ICON_PATHS set (still used elsewhere —
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
  unreadMessageCount: number;
}

// "About" and "Sign out" live inside Settings now, not as dock icons —
// pinned to the bottom of its nav there, always. "Profile" moved to the
// TopBar as the user's own avatar photo, next to the notification bell.
// "Admin" moved there too, by direct instruction — next to the
// notification bell rather than a sixth dock icon (see TopBar.tsx) — since
// it's a role-gated destination for the one admin account, not an
// everyday nav item every signed-in visitor taps.
//
// No "More" overflow, on any width: it briefly existed for mobile, but once
// About/Sign-out moved into Settings, Settings was the only thing it was
// still gatekeeping — every real destination (Lessons included) was already
// a direct icon. An overflow menu hiding exactly one item, itself the
// gateway to the other two, wasn't earning its tap. Same five items,
// mobile and desktop alike, admin or not.
// `dataTour` values are OnboardingTour's hooks (see tourSteps.ts) — they
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
 * The app's only bottom navigation now, at every breakpoint — a floating
 * dock, replacing both the old vertical `Sidebar` rail (desktop) and
 * `MobileTabBar` (phone). Both old files are still in the tree, used by
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
 * Icon-only, no caption under each icon — by direct instruction ("remove
 * the texts from the dock"). `aria-label` on both `Link` and `DockItem`
 * still carries each destination's real name for a screen reader; only the
 * always-visible printed caption is gone. See the `NAV_ITEMS.map` below for
 * what replaced the caption's old job of marking which tab is active — a
 * spotlight glow plus a thin top line, not a label treatment at all.
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
export function AppDock({ unreadMessageCount }: AppDockProps) {
  const pathname = usePathname();
  // -1 on a page that isn't any dock destination itself (a scale's own
  // lesson page, say) — the per-item spotlight below treats that as "no
  // tab active" rather than letting the distance math single out whichever
  // tab happens to be closest to index -1 for no real reason.
  const activeIndex = NAV_ITEMS.findIndex((item) => pathname === item.href);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

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

  return (
    <>
      {/* Every card app-wide sits at `--c-surface-solid` (a lighter "raised"
          tone, by design — the same one the dock's own comments contrast
          against) on top of the plain `--c-s-950` page ground. Whatever the
          visitor happens to have scrolled to the bottom of the page is just
          as likely to be one of those lighter cards as it is plain ground —
          the roadmap's own "current step" card among them — and the dock
          floating directly on top of a lighter card edge, in its own forced
          pure black (see the override below), reads as a hard, unintended
          seam of mismatched dark greys: reported live as "a different shade
          of dark grey" right at the bottom. This doesn't touch either color
          (cards keep their normal elevation everywhere else; the dock stays
          pure black) — it just fades whatever's approaching the dock's own
          floating zone back to the page's own ground tone first, so the
          dock only ever meets that, never a lighter card straight-on.
          Ground-token-based, not a hardcoded black, since Editorial Paper's
          ground is a light cream — a fade to black there would be its own,
          worse mismatch. `h-52`/z-30: tall and low enough to sit fully
          behind the dock's resting AND hover-magnified states without
          poking out as its own visible edge. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 h-52 bg-gradient-to-t from-[rgb(var(--c-s-950))] to-transparent"
      />
      <div
        role="navigation"
        aria-label="Primary"
        className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center pb-[env(safe-area-inset-bottom)]"
      >
        <motion.div
          ref={wrapperRef}
          className="pointer-events-auto"
          animate={{ y: effectivelyVisible ? 0 : "calc(100% + 24px)", opacity: effectivelyVisible ? 1 : 0 }}
          transition={{ type: "spring", bounce: 0, duration: 0.35 }}
        >
          {/* A slow, continuous bob — the same idle-float touch the reference
              dock has at rest. Independent of the hide/show transform above
              (that one's a one-shot spring to a target, this one's an
              infinite loop), so it's its own nested motion.div rather than
              merged into the same animate prop. Off entirely under reduced
              motion, same as the hide/reveal slide itself. */}
          <motion.div
            animate={reducedMotion ? undefined : { y: [-2, 2, -2] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            {/* !bg-black/!bg-none/!border-white/10 override `glass-surface-
                elevated`'s own theme-driven glass background — solid black
                regardless of theme or accent, by direct instruction. Both
                `!bg-black` AND `!bg-none` are needed: `glass-surface-elevated`
                sets `background` as a shorthand (a translucent gradient, see
                `--elev-bg`), and Tailwind's `bg-*` utility only overrides the
                shorthand's background-color slot — the gradient's own
                background-image would otherwise keep painting over the black,
                a soft wash rather than the requested pitch black. The `!` is
                load-bearing on both: `glass-surface-elevated` sets these via a
                plain class rule, not an inline style, so an unmarked override
                isn't guaranteed to win the cascade against it.
  
                `!backdrop-blur-none` removes `glass-surface-elevated`'s own
                `backdrop-filter: blur(...)`, which is pure dead weight on a
                100%-opaque black bar — there's nothing behind it left to blur
                into view. It's also the precondition for a well-documented
                WebKit rendering bug: `backdrop-filter` combined with
                `border-radius` on an element that doesn't otherwise clip its
                own content (this bar is `overflow: visible`, so its box-shadow
                glow can extend past its own box) can leak a faint square-
                cornered halo at each rounded corner in Safari, because the
                blur's own compositing layer doesn't reliably mask itself to
                the rounded shape — reported as "a light gray sharp corner on
                all sides of the smooth corners" surviving even after the
                tap-highlight fix (that fix addressed a real, separate
                tap-only flash; this addresses a persistent one). Removing the
                backdrop-filter here removes the bug's precondition entirely,
                without needing `overflow: hidden` (which would also clip the
                glow this bar is meant to have).
  
                `!shadow-[...]` overrides `glass-surface-elevated`'s own
                `--elev-shadow` for the same reason as the three overrides
                above: that token is a *dark* drop shadow (tuned for a card
                sitting on a lighter surface), which all but disappears
                underneath a bar that's forced solid black sitting on this
                app's own near-black page ground — direct instruction: "the
                dock is not a freely suspended thing, it's lying on [the
                bottom edge]." A dark shadow can't read as elevation once
                there's no lighter surface for it to fall on, so this pairs a
                normal dark contact shadow (still doing real work wherever the
                page behind happens to be lighter, e.g. the Paper theme) with
                a soft white ambient glow, the same light-not-dark technique
                the icons above already use to read as lit against black.

                `!rounded-full` fixes the actual, still-unaddressed source of
                the corner artifact reported after the backdrop-filter fix
                above (that fix was real — it closed a genuine bug class —
                but it wasn't this one). `dock.tsx`'s own `Dock` hardcodes
                `rounded-2xl` (1rem) on the very same element that also
                carries `glass-surface-elevated`, which sets its own
                `border-radius: var(--surface-radius)` (0.75rem on Paper,
                0.5rem on Ink) — two same-specificity classes fighting over
                one property, on the one element none of the four overrides
                above ever touched. Nothing here ever decided which wins;
                it was just whichever the build's own class order happened
                to emit last. Either way, 0.5-1rem on a 60px-tall bar is a
                visibly squared corner, not the smooth capsule this bar is
                designed to be — and a genuine cascade tie is exactly the
                kind of thing that can paint one way in one browser/engine
                and differently in another, which fits "the curve is there
                but so is a frame around it" better than a single clean
                radius ever would. Forcing one explicit, fully-rounded value
                here removes the conflict outright instead of relying on a
                tiebreak this file never actually chose. */}
            <Dock
              className="items-center !rounded-full !bg-black !bg-none !border-white/10 !backdrop-blur-none !shadow-[0_14px_32px_-10px_rgba(0,0,0,0.65),0_0_40px_-4px_rgba(255,255,255,0.12)]"
              magnification={72}
              distance={140}
              panelHeight={60}
            >
              {/* Icon-only now, by direct instruction ("remove the texts") —
                  the permanent-caption layout (`flex-col`, a bottom-anchored
                  bar via `items-end pb-3` above) is gone along with the
                  labels themselves, so the bar is `items-center` instead:
                  with no caption anchoring each tab to the bottom, centering
                  is what actually puts the icon in the middle of the bar's
                  own height rather than low and cramped against where the
                  removed label used to sit.

                  The active-tab indicator is a "spotlight" pair now (look
                  ported from a reference component, by direct instruction),
                  replacing the previous liquid-glass droplet pill entirely:
                  a soft light glowing down from directly above the active
                  icon, plus a thin white line hovering at the top of the
                  bar above it. Every tab carries a dimmer version of the
                  same glow, falling off with distance from whichever tab is
                  actually active — a roaming spotlight sweeping the whole
                  bar, not just a single fixed pool of light — the reference's
                  own `Math.max(0, 1 - distance * 0.6)` falloff curve,
                  ported as-is since it's what gives the sweep its shape.

                  This also happens to remove the one other place the bar's
                  own documented corner-artifact bug (see the big comment
                  above `<Dock`) could still have been sneaking in from: the
                  droplet this replaces carried its own inline
                  `backdropFilter`, entirely separate from — and not reached
                  by — the outer bar's `!backdrop-blur-none` override, which
                  only ever touched `glass-surface-elevated`'s own backdrop-
                  filter, not a one-off inline style on a child. That's gone
                  now along with the droplet itself. The glow below uses a
                  plain `filter: blur()` (Tailwind's `blur-lg`), not
                  `backdrop-filter` — blurring the glow's own pixels rather
                  than sampling and blurring whatever sits behind it, which
                  is the specific combination (backdrop-sampling blur +
                  border-radius on a non-clipping element) the bug actually
                  needs, so this isn't a new instance of it. */}
              {NAV_ITEMS.map((item, index) => {
                const active = pathname === item.href;
                const badge = item.href === "/messages" ? unreadMessageCount : 0;
                const Icon = NAV_ICON[item.icon];
                // -1 (no tab active — e.g. a scale's own lesson page, which
                // has no fixed dock destination of its own) deliberately
                // leaves every glow off rather than the falloff math
                // treating index 0 as "closest to -1" and lighting it up
                // for no real reason.
                const spotlightOpacity =
                  activeIndex === -1 ? 0 : active ? 1 : Math.max(0, 1 - Math.abs(activeIndex - index) * 0.6);

                return (
                  // Badge lives on this wrapper, not inside `DockItem` — that
                  // component clones its direct children unconditionally (see
                  // dock.tsx), so a third, sometimes-`false` child there
                  // crashes it. `DockItem` gets exactly one static child
                  // (`DockIcon`), always.
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-label={item.label}
                    data-tour={"dataTour" in item ? item.dataTour : undefined}
                    className="relative flex items-center justify-center px-1"
                  >
                    {/* The glow: a blurred white gradient, positioned above
                        the icon (`-translate-y-full` moves it fully clear of
                        the icon itself, rather than the reference's own
                        half-overlapping version, since there's no label
                        underneath here competing for the same vertical
                        space) and centered on the tab's own box so it tracks
                        correctly even while magnification is resizing that
                        box. Opacity-only transition (not position), since
                        every tab's glow lives in the same spot at all times
                        — only how bright it is ever changes. */}
                    <div
                      aria-hidden
                      className="pointer-events-none absolute left-1/2 top-0 h-14 w-12 -translate-x-1/2 -translate-y-full rounded-full bg-gradient-to-b from-white/40 to-transparent blur-lg transition-opacity duration-300"
                      style={{ opacity: spotlightOpacity, transitionDelay: active ? "100ms" : "0ms" }}
                    />
                    {/* The line: only the active tab gets one, and the
                        shared `layoutId` is what makes Framer Motion slide
                        the single element from one tab's position to the
                        next on navigation, instead of one instance fading
                        out while a new one fades in elsewhere — the same
                        shared-layout technique the previous glass-droplet
                        indicator used, just carried over to this new shape
                        rather than reinventing it. */}
                    {active && (
                      <motion.div
                        layoutId="dock-active-line"
                        transition={{ type: "spring", bounce: 0.15, duration: 0.55 }}
                        className="pointer-events-none absolute left-1/2 top-0 h-[2px] w-8 -translate-x-1/2 -translate-y-2 rounded-full bg-white"
                      />
                    )}
                    <motion.div whileTap={{ scale: 0.9 }} className="relative">
                      {/* White at every step, not accent-colored — same
                          direct instruction as the dock's own background.
                          Active vs inactive is opacity, glow, and now stroke
                          weight too (a subtly bolder active glyph, matching
                          the reference): every icon carries a soft white
                          ambient glow at rest (a `drop-shadow` on the icon
                          itself, since that follows the glyph's own shape
                          rather than boxing it like `box-shadow` would), and
                          the active tab's icon glows brighter still. */}
                      <DockItem
                        aria-label={item.label}
                        className={`rounded-full transition-colors duration-200 ${active ? "" : "hover:bg-white/8"}`}
                      >
                        <DockIcon>
                          <Icon
                            strokeWidth={active ? 2.5 : 2}
                            className={`h-full w-full transition-[color,filter] duration-200 ${
                              active
                                ? "text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.9)]"
                                : "text-white/60 drop-shadow-[0_0_4px_rgba(255,255,255,0.3)]"
                            }`}
                          />
                        </DockIcon>
                      </DockItem>
                    </motion.div>
                    {Boolean(badge) && (
                      <span className="pointer-events-none absolute right-0 top-0 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-[rgb(var(--c-s-50))] px-1 text-[9px] font-bold text-slate-950">
                        {badge > 9 ? "9+" : badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </Dock>
          </motion.div>
        </motion.div>
      </div>
    </>
  );
}

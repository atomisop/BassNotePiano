"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dock, DockIcon, DockItem } from "@/components/ui/dock";
import { NavIcon, ICON_PATHS } from "./navIcons";

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
 */
export function AppDock({ isAdmin, unreadMessageCount }: AppDockProps) {
  const pathname = usePathname();

  const items = isAdmin
    ? [...NAV_ITEMS, { href: "/admin/payments", label: "Admin", icon: ICON_PATHS.admin }]
    : NAV_ITEMS;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center pb-[env(safe-area-inset-bottom)]">
      <div className="pointer-events-auto">
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
      </div>
    </div>
  );
}

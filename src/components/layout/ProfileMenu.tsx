"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import { OwnerStarBadge } from "@/components/ui/OwnerStar";
import { popoverVariants } from "@/lib/motionTokens";
import { startNavigation } from "@/lib/navigationState";
import { Bell, ClipboardCheck, NotebookPen, Users } from "@/components/ui/appIcons";
import { ATTENDANCE_READY_COUNT, OPEN_ATTENDANCE, OPEN_NOTIFICATIONS, OPEN_STUDENT_NOTES, UNREAD_COUNT, announce, listen } from "@/lib/topBarEvents";
import { SignOut } from "@/components/ui/appIcons";

// Same glyph AccountSettings.tsx's own "Sign out" row uses (TAB_ICONS.logout),
// one logout icon across the app, not a second one invented here.

export interface ProfileMenuProps {
  name: string | null;
  username: string | null;
  email: string | null;
  image: string | null;
  /** The studio owner's avatar carries a small gold star. */
  isOwner?: boolean;
  /** Appended after the trigger's base sizing classes so a caller in a
      different-sized row (e.g. MarketingNav's h-9 pills) can fit in with
      its neighbors, `!`-prefixed the same way MarketingNav's own primary
      CTA already overrides shared button classes. */
  triggerClassName?: string;
  /**
   * The signed-in app's top bar. On phones it keeps only Atom, the credit badge and this picture, so everything else (Admin or
   * Live classes, notifications and mail, and for the owner student notes and class attendance) is listed here, phones only.
   * Tablets and computers keep their buttons in the bar and never see these rows.
   */
  appExtras?: { isAdmin: boolean };
  /** "dock": the picture fills the dock's round island and the menu opens upward, since it sits at the bottom of the screen. */
  placement?: "down" | "up";
}

/**
 * The TopBar avatar, upgraded from a plain link-to-/profile into a menu:
 * quick identity confirmation (useful specifically for the admin, who's
 * often mid-way through looking at someone else's account) plus one-click
 * settings/logout instead of Dock → Settings → scroll-to-bottom every time.
 *
 * Client component because it needs open/close state and outside-click/Esc
 * handling; the avatar image itself still comes from the server (see
 * TopBar's ProfileAvatarLink) since `image` is deliberately kept out of the
 * JWT/session.
 */
export function ProfileMenu({ name, username, email, image, isOwner = false, triggerClassName, appExtras, placement = "down" }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  // Counts the hidden top bar buttons announce, shown here and on the picture (phones only).
  const [unread, setUnread] = useState(0);
  const [activeBookings, setActiveBookings] = useState(0);
  useEffect(() => (appExtras ? listen(UNREAD_COUNT, setUnread) : undefined), [appExtras]);
  useEffect(() => (appExtras && isOwner ? listen(ATTENDANCE_READY_COUNT, setActiveBookings) : undefined), [appExtras, isOwner]);
  const phoneBadge = unread + (isOwner ? activeBookings : 0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        // A keyboard user dismissing this needs to land back where they
        // were, not have focus silently drop to <body> once this panel
        // unmounts out from under whichever link/button they were on.
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const displayName = name ?? username ?? "Account";
  const initial = (name ?? username ?? "?").charAt(0).toUpperCase();

  return (
    <div ref={rootRef} className={placement === "up" ? "relative h-full w-full" : "relative"}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={appExtras && phoneBadge > 0 ? `Your account, ${phoneBadge} new` : "Your account"}
        aria-expanded={open}
        data-tour="nav-profile"
        onClick={() => setOpen((v) => !v)}
        className={
          placement === "up"
            ? `relative flex h-full w-full select-none items-center justify-center rounded-full p-[4px] [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${triggerClassName ?? ""}`
            : `tap press relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neu-base p-[3px] ${
                open ? "shadow-pressed-low" : "shadow-raised-low hover:shadow-raised-mid active:shadow-pressed-low"
              } ${triggerClassName ?? ""}`
        }
      >
        <span className="block h-full w-full overflow-hidden rounded-full bg-slate-50/10 shadow-pressed-low">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URI, next/image can't optimize it
            <img src={image} alt="" className="h-full w-full object-cover" />
          ) : (
            // The letter is drawn by CSS (not text in the page): the button already has a name ("Your account"), and a one-letter avatar
            // is decoration that would otherwise count as visible text the name must contain.
            <span aria-hidden data-char={initial} className={`flex h-full w-full items-center justify-center text-slate-50 after:content-[attr(data-char)] ${placement === "up" ? "text-title" : "text-small"}`} />
          )}
        </span>
        {isOwner && <OwnerStarBadge />}
        {appExtras && phoneBadge > 0 && (
          // Phones only: the bell and the attendance button are in this menu there, so their counts show on the picture.
          <span aria-hidden data-char={phoneBadge > 9 ? "9+" : String(phoneBadge)} className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-signal px-1 text-small font-bold text-slate-950 after:content-[attr(data-char)] md:hidden" />
        )}
      </button>

      <AnimatePresence>
      {open && (
        // role="region", not "menu": this is plain navigation links plus one
        // action, not an application menu, and declaring "menu" without also
        // building full arrow-key roving-tabindex navigation (which a real
        // ARIA menu obligates) would tell a screen reader user to use arrow
        // keys that then do nothing. Region just labels the group; the
        // links/button inside are already correctly accessible as themselves.
        <motion.div
          role="region"
          aria-label="Account menu"
          variants={popoverVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          style={{ transformOrigin: placement === "up" ? "bottom right" : "top right" }}
          className={`glass-menu absolute right-0 z-50 w-64 overflow-hidden p-1.5 ${placement === "up" ? "bottom-[calc(100%+1.1rem)]" : "top-[calc(100%+0.5rem)]"}`}
        >
          <div className="flex items-center gap-3 px-2.5 py-2">
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-slate-50/30 bg-neu-base shadow-pressed-low">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-small text-slate-50">
                  {initial}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-small font-medium text-slate-100">{displayName}</p>
              {email && <p className="truncate text-small text-slate-500">{email}</p>}
            </div>
          </div>

          <div className="my-1.5 border-t border-ink/10" />

          {/* A student's dock has Friends. An admin's dock has Admin in its place, so Friends is listed here, first, at every width. */}
          {appExtras?.isAdmin && (
            <>
              <MenuLink href="/friends" icon={<Users className="h-4 w-4" strokeWidth={1.5} />} label="Friends" onNavigate={() => setOpen(false)} />
              <div className="my-1.5 border-t border-ink/10 md:hidden" />
            </>
          )}

          {appExtras && (
            <div className="md:hidden">
              <MenuAction icon={<Bell className="h-4 w-4" strokeWidth={1.5} />} label="Inbox" count={unread} onClick={() => { setOpen(false); announce(OPEN_NOTIFICATIONS); }} />
              {isOwner && (
                <>
                  <MenuAction icon={<ClipboardCheck className="h-4 w-4" strokeWidth={1.5} />} label="Class bookings and attendance" count={activeBookings} onClick={() => { setOpen(false); announce(OPEN_ATTENDANCE); }} />
                  <MenuAction icon={<NotebookPen className="h-4 w-4" strokeWidth={1.5} />} label="Student notes" onClick={() => { setOpen(false); announce(OPEN_STUDENT_NOTES); }} />
                </>
              )}
              <div className="my-1.5 border-t border-ink/10" />
            </div>
          )}

          {/* Inside the app the dock and sidebar already have Home and Settings; the menu repeats them only on the public pages. */}
          {!appExtras && (
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="tap block rounded-lg px-2.5 py-2 text-small text-slate-300 transition hover:bg-slate-800/60 hover:text-slate-100"
            >
              Home
            </Link>
          )}
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="tap block rounded-lg px-2.5 py-2 text-small text-slate-300 transition hover:bg-slate-800/60 hover:text-slate-100"
          >
            Profile
          </Link>
          {/* Inside the app Settings is the gear in the top bar; the menu repeats it only on the public pages. */}
          {!appExtras && (
            <Link
              href="/account"
              onClick={() => setOpen(false)}
              className="tap block rounded-lg px-2.5 py-2 text-small text-slate-300 transition hover:bg-slate-800/60 hover:text-slate-100"
            >
              Settings
            </Link>
          )}

          <div className="my-1.5 border-t border-ink/10" />

          <button
            type="button"
            onClick={() => {
              startNavigation();
              void signOut({ callbackUrl: "/" });
            }}
            className="tap flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-small text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-200"
          >
            <SignOut size={15} />
            Log out
          </button>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}

const ROW = "tap press-soft flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-small text-slate-300 hover:bg-slate-800/60 hover:text-slate-100";

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="ml-auto flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-signal px-1 text-small font-bold text-slate-950">{count > 9 ? "9+" : count}</span>;
}

function MenuAction({ icon, label, count = 0, onClick }: { icon: React.ReactNode; label: string; count?: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={ROW}>
      <span className="text-slate-500">{icon}</span>
      {label}
      <CountBadge count={count} />
    </button>
  );
}

function MenuLink({ href, icon, label, onNavigate }: { href: string; icon: React.ReactNode; label: string; onNavigate: () => void }) {
  return (
    <Link href={href} onClick={onNavigate} className={ROW}>
      <span className="text-slate-500">{icon}</span>
      {label}
    </Link>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";

// Same glyph AccountSettings.tsx's own "Sign out" row uses (TAB_ICONS.logout)
// — one logout icon across the app, not a second one invented here.
const LOGOUT_ICON_PATH = "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9";

export interface ProfileMenuProps {
  name: string | null;
  username: string | null;
  email: string | null;
  image: string | null;
  /** Appended after the trigger's base sizing classes so a caller in a
      different-sized row (e.g. MarketingNav's h-9 pills) can fit in with
      its neighbors — `!`-prefixed the same way MarketingNav's own primary
      CTA already overrides shared button classes. */
  triggerClassName?: string;
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
export function ProfileMenu({ name, username, email, image, triggerClassName }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
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
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Your account"
        aria-expanded={open}
        data-tour="nav-profile"
        onClick={() => setOpen((v) => !v)}
        className={`h-8 w-8 shrink-0 overflow-hidden rounded-full border border-[rgb(var(--c-a-400)/0.3)] bg-[rgb(var(--c-a-400)/0.1)] transition hover:border-[rgb(var(--c-a-400)/0.6)] ${triggerClassName ?? ""}`}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URI, next/image can't optimize it
          <img src={image} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-serif text-sm text-[rgb(var(--c-a-300))]">
            {initial}
          </div>
        )}
      </button>

      {open && (
        // role="region", not "menu": this is plain navigation links plus one
        // action, not an application menu, and declaring "menu" without also
        // building full arrow-key roving-tabindex navigation (which a real
        // ARIA menu obligates) would tell a screen reader user to use arrow
        // keys that then do nothing. Region just labels the group; the
        // links/button inside are already correctly accessible as themselves.
        <div
          role="region"
          aria-label="Account menu"
          className="glass-surface-elevated absolute right-0 top-[calc(100%+0.5rem)] z-50 w-64 overflow-hidden p-1.5"
        >
          <div className="flex items-center gap-3 px-2.5 py-2">
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-[rgb(var(--c-a-400)/0.3)] bg-[rgb(var(--c-a-400)/0.1)]">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-serif text-sm text-[rgb(var(--c-a-300))]">
                  {initial}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-100">{displayName}</p>
              {email && <p className="truncate text-xs text-slate-500">{email}</p>}
            </div>
          </div>

          <div className="my-1.5 border-t border-ink/10" />

          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-2.5 py-2 text-sm text-slate-300 transition hover:bg-slate-800/60 hover:text-slate-100"
          >
            Profile
          </Link>
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-2.5 py-2 text-sm text-slate-300 transition hover:bg-slate-800/60 hover:text-slate-100"
          >
            Settings
          </Link>

          <div className="my-1.5 border-t border-ink/10" />

          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-200"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d={LOGOUT_ICON_PATH} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

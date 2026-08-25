"use client";

import { useSession } from "next-auth/react";

import { Navbar1, type MenuItem } from "@/components/blocks/shadcnblocks-com-navbar1";
import { DiscordIcon } from "@/components/ui/icons";
import { DISCORD_INVITE_URL } from "@/lib/discord";

/**
 * The marketing header: shadcnblocks' Navbar1 block, given this site's real
 * routes and hung in the floating-capsule position the marketing pages are
 * built around.
 *
 * Why it stays `fixed` rather than sitting in flow the way the upstream block
 * does: all four marketing pages open with a full-bleed photo backdrop — two
 * of them pin it with `fixed inset-0 -z-10` — and reserve the header's space
 * with their own top padding. An in-flow navbar would push those heroes down
 * and paint a strip of page ground across the top of the photograph. Fixed,
 * not sticky, for the reason the previous header documented: `position:
 * sticky` stops working inside the `overflow-hidden` wrappers those backdrops
 * need.
 *
 * Every link points at a route that exists. Same rule SiteFooter holds
 * itself to — no Products/Careers/Status columns borrowed from the block's
 * demo data.
 */

const MENU: MenuItem[] = [
  { title: "Home", url: "/" },
  {
    title: "Learn",
    url: "#",
    items: [
      {
        title: "Live classes",
        description:
          "Weekly sessions on Discord. Tell us where you're starting from and we'll get you scheduled.",
        url: "/classes",
      },
      {
        title: "The curriculum",
        description:
          "Six Ethiopian kiñit scales, spelled correctly in every key, with chords and practice tracks.",
        url: "/pricing",
      },
    ],
  },
  { title: "Pricing", url: "/pricing" },
];

// Reachable from the footer on every page, but the mobile sheet is the only
// place the header can carry it without crowding the capsule.
const MOBILE_EXTRA_LINKS = [{ name: "Terms & refunds", url: "/terms" }];

export function SiteNavbar() {
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);

  // The block's auth pair is two buttons either way, so signed-in visitors
  // get their two real account destinations rather than a "Sign up" that
  // would send them back through a flow they have already completed.
  const auth = isLoggedIn
    ? {
        login: { text: "Account", url: "/account" },
        signup: { text: "Dashboard", url: "/dashboard" },
      }
    : {
        login: { text: "Log in", url: "/login" },
        signup: { text: "Create account", url: "/register" },
      };

  return (
    <header className="fixed inset-x-0 top-4 z-30 mx-auto w-full max-w-6xl px-4 sm:top-6 sm:px-6">
      {/*
        `--muted-foreground` is raised for the capsule only. The token's
        global value (`--c-s-500`) is chosen to clear AA against the page
        ground, but this header floats on a translucent pill over a
        photograph, where the effective backdrop is neither. `--c-s-300` is
        the ramp's strong-body step in every theme, so the links read the way
        the previous header's `text-slate-200` did — without any of the
        components needing to know they are on glass.
      */}
      <div className="glass-pill [--muted-foreground:var(--c-s-300)]">
        <Navbar1
          className="py-2"
          logo={{
            url: "/",
            src: "/logo-mark.png",
            // Empty, not "Bass Note Piano": Navbar1 renders logo.title as
            // its own visible text right next to this image (see
            // shadcnblocks-com-navbar1.tsx), so a non-empty alt here made a
            // screen reader announce the name twice. Same decorative-logo
            // treatment every other place this mark appears already uses.
            alt: "",
            title: "Bass Note Piano",
          }}
          menu={MENU}
          mobileExtraLinks={MOBILE_EXTRA_LINKS}
          auth={auth}
          extraAction={{
            href: DISCORD_INVITE_URL,
            label: "Join our Discord",
            icon: <DiscordIcon size={16} />,
          }}
        />
      </div>
    </header>
  );
}

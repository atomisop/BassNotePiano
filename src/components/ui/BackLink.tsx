"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, MouseEvent } from "react";
import { canGoBackInApp } from "@/lib/navHistory";
import { ChevronLeft } from "@/components/ui/appIcons";
import { cn } from "@/lib/utils";

/**
 * A Back button that goes to the page the person was just on. `href` is only the fallback for when there is no earlier page
 * in the app (they opened this page directly, from a bookmark or another site), and what a middle click or "open in new tab" uses.
 */
export function BackLink({ href, onClick, ...rest }: ComponentProps<typeof Link>) {
  const router = useRouter();
  function handle(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (canGoBackInApp()) {
      e.preventDefault();
      router.back();
    }
  }
  return <Link href={href} onClick={handle} {...rest} />;
}

/**
 * The one Back button every inner screen shows, top left above its heading, like the apps people already use (Jakob's law): a
 * chevron and "Back". Top-level tabs (Home, Roadmap, Lessons, Messages, Settings, the admin Overview) have none, like Instagram's.
 */
export function PageBack({ href, label = "Back", className }: { href: string; label?: string; className?: string }) {
  return (
    <BackLink
      href={href}
      className={cn(
        "tap -ml-1.5 mb-1 inline-flex w-fit items-center gap-0.5 rounded-control py-1 pr-2 pl-0.5 text-small font-medium text-slate-400 transition hover:text-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <ChevronLeft aria-hidden className="h-5 w-5" />
      {label}
    </BackLink>
  );
}

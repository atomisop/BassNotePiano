"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, MouseEvent } from "react";
import { canGoBackInApp } from "@/lib/navHistory";

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

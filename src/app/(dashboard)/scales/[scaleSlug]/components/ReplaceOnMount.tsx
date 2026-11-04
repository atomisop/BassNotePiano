"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Moves the browser to another page as soon as this one shows. Used instead of a server `redirect()` inside a page that sits under a
 * loading screen: that kind of redirect is sent after the page has started streaming, and Next 15.5 can fail on it (React error 310)
 * and leave the loading screen up for good when the address is opened directly.
 */
export function ReplaceOnMount({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(href);
  }, [router, href]);
  return null;
}

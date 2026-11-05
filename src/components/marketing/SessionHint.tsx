"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Whether the visitor was signed in when the server rendered the page.
 *
 * The marketing header decides between "Log in / Get started" and the profile button with `useSession()`, which only knows the
 * answer once the browser has asked /api/auth/session. Until then the header drew empty placeholder pills, and on a phone on a
 * slow connection the two conversion pages (Pricing, Classes) showed blank ovals where "Get started" belongs for several seconds
 * (seen in the 2026-11-02 audit). The marketing layout already runs on the server with the request's cookies, so it reads the
 * session once and hands the answer down here; the header renders the right buttons on the very first paint and `useSession()`
 * only ever corrects it (sign-out in another tab, an expired session).
 *
 * `null` means "nobody told us" (a page rendered outside the marketing layout), in which case the header keeps its placeholder.
 */
const SessionHintContext = createContext<boolean | null>(null);

export function SessionHintProvider({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  return <SessionHintContext.Provider value={signedIn}>{children}</SessionHintContext.Provider>;
}

export function useSessionHint(): boolean | null {
  return useContext(SessionHintContext);
}

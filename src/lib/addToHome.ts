/** Pure rules for the "Add to Home Screen" prompt, so they can be tested. */
export type HomeScreenPlatform = "ios" | "android" | "other";

export function detectPlatform(userAgent: string, maxTouchPoints = 0): HomeScreenPlatform {
  if (/iPhone|iPad|iPod/.test(userAgent)) return "ios";
  // iPadOS 13+ reports itself as a Mac but has a touch screen.
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return "ios";
  if (/Android/.test(userAgent)) return "android";
  return "other";
}

/** Asked once per device, only on a phone or tablet, and never to someone already using the app from their Home Screen. */
export function shouldPromptAddToHome(input: { platform: HomeScreenPlatform; standalone: boolean; seen: boolean }): boolean {
  return input.platform !== "other" && !input.standalone && !input.seen;
}

export interface HomeScreenStep {
  title: string;
  detail: string;
  icon: "share" | "plus" | "menu" | "open";
}

export const HOME_SCREEN_STEPS: Record<"ios" | "android", HomeScreenStep[]> = {
  ios: [
    { title: "Open this site in Safari", detail: "If you are inside another app (Instagram, an email), tap the three dots or the compass and choose Open in Safari.", icon: "open" },
    { title: "Tap the Share button", detail: "The square with an arrow pointing up, at the bottom of Safari (or next to the address bar).", icon: "share" },
    { title: "Choose Add to Home Screen", detail: "Scroll down in the list that opens, then tap Add to Home Screen.", icon: "plus" },
    { title: "Tap Add", detail: "Bass Note Piano is now on your Home Screen. Open it from there and it fills the whole screen like an app.", icon: "open" },
  ],
  android: [
    { title: "Open this site in Chrome", detail: "Other browsers work too, but the menu below may be named a little differently.", icon: "open" },
    { title: "Tap the menu", detail: "The three dots at the top right of the browser.", icon: "menu" },
    { title: "Choose Install app (or Add to Home screen)", detail: "Then tap Install or Add to confirm.", icon: "plus" },
    { title: "Open it from your Home Screen", detail: "It opens full screen with no browser bars, like an app.", icon: "open" },
  ],
};

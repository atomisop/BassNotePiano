/** Pure rules for web push. The endpoint a browser hands us is a URL our server will POST to, so only the real push services are accepted. */
const ALLOWED_HOSTS: (string | RegExp)[] = [
  "fcm.googleapis.com", // Chrome, Edge, Brave, Android
  "updates.push.services.mozilla.com", // Firefox
  /^[a-z0-9-]+\.push\.services\.mozilla\.com$/,
  /^[a-z0-9.-]+\.notify\.windows\.com$/, // old Edge
  "web.push.apple.com", // Safari, iPhone and iPad home-screen apps
  /^[a-z0-9-]+\.push\.apple\.com$/,
];

export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  return ALLOWED_HOSTS.some((h) => (typeof h === "string" ? h === url.hostname : h.test(url.hostname)));
}

const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

export function parsePushSubscription(input: unknown): { endpoint: string; p256dh: string; auth: string } | null {
  if (!input || typeof input !== "object") return null;
  const o = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const p256dh = o.keys?.p256dh;
  const auth = o.keys?.auth;
  if (!isAllowedPushEndpoint(o.endpoint)) return null;
  if (typeof p256dh !== "string" || typeof auth !== "string") return null;
  if (!B64URL.test(p256dh) || !B64URL.test(auth) || p256dh.length > 200 || auth.length > 100) return null;
  return { endpoint: o.endpoint, p256dh, auth };
}

/** Only the two kinds of reminder are ever pushed; everything else stays in the bell and email. */
export function categoryIsPushed(category: string | undefined | null): boolean {
  return category === "reminders" || category === "classes";
}

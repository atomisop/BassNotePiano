/**
 * A callback destination is only followed if it is a plain in-app path. Anything
 * else (another site, "//host", "/\host" which browsers read as "//host", or text
 * with control characters) falls back to the dashboard.
 */
export function safeCallbackPath(url: string | null | undefined, fallback = "/dashboard"): string {
  if (!url || !url.startsWith("/") || url.startsWith("//") || url.includes("\\") || /[\u0000-\u001f]/.test(url)) return fallback;
  return url;
}

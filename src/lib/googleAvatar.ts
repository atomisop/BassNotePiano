/**
 * The profile picture Google shows for an account, copied once into our own `User.image` (a data URI, the same shape as an uploaded avatar), never
 * hot-linked: a link to Google would tell Google who views each page, and the strict image policy would block it anyway.
 *
 * Only a picture on Google's own picture hosts is fetched (our server makes the request, so the address must never be a free-form URL), small
 * (128 px), with a short timeout and a hard size cap. Any failure returns null and sign-in carries on without a picture.
 */
const MAX_BYTES = 80 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Google picture URLs are `https://lh3.googleusercontent.com/...`; the size suffix (`=s96-c`) is replaced to ask for 128 px. Pure, tested. */
export function googlePictureUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  if (!/^lh\d\.googleusercontent\.com$/.test(u.hostname)) return null;
  u.search = "";
  u.hash = "";
  u.pathname = u.pathname.replace(/=[sw]\d+[^/]*$/, "") + "=s128-c";
  return u.toString();
}

export async function fetchGoogleAvatarDataUri(raw: string | null | undefined): Promise<string | null> {
  const url = googlePictureUrl(raw);
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), redirect: "error", headers: { accept: "image/jpeg,image/png,image/webp" } });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_TYPES.has(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_BYTES) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

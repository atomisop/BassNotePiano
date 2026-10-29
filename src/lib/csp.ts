/**
 * The stricter Content-Security-Policy, sent as Content-Security-Policy-Report-Only next to the enforced one in
 * next.config.mjs. Scripts must carry this request's nonce ('strict-dynamic' lets those scripts load their own chunks),
 * so an injected inline script is refused. Pure and edge-safe: the middleware builds it per request.
 */

export interface CspEnv {
  R2_PUBLIC_URL?: string;
  R2_ACCOUNT_ID?: string;
  R2_BUCKET_NAME?: string;
}

export const CSP_REPORT_PATH = "/api/csp-report";

export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function origin(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

/** Same sources as the enforced policy in next.config.mjs, except script-src. Keep the two in step. */
export function buildStrictCsp(nonce: string, isDev: boolean, env: CspEnv): string {
  const r2 = origin(env.R2_PUBLIC_URL);
  const upload = env.R2_ACCOUNT_ID && env.R2_BUCKET_NAME ? `https://${env.R2_BUCKET_NAME}.${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : "";
  const withR2 = (base: string) => (r2 ? `${base} ${r2}` : base);
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    withR2("img-src 'self' data: blob: https://images.unsplash.com"),
    withR2("media-src 'self'"),
    withR2("frame-src 'self' https://challenges.cloudflare.com"),
    "font-src 'self' data:",
    `connect-src 'self' https://app.glitchtip.com https://cdn.jsdelivr.net${r2 ? ` ${r2}` : ""}${upload ? ` ${upload}` : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    `report-uri ${CSP_REPORT_PATH}`,
  ].join("; ");
}

/** Pages that need a signed-in session (the old middleware matcher): a prefix, or exactly /about and /onboarding. */
const PROTECTED_PREFIXES = ["/dashboard", "/scales", "/admin", "/billing", "/account", "/friends", "/messages", "/lessons", "/practice", "/profile", "/mail", "/parent", "/roadmap", "/streak"];
const PROTECTED_EXACT = ["/about", "/onboarding"];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_EXACT.includes(pathname) || PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** A browser's violation report, cut down to the few fields worth a log line (no query strings, which can hold tokens). */
export function summarizeCspReport(body: unknown): string | null {
  const r = (body as { "csp-report"?: Record<string, unknown> } | null)?.["csp-report"] ?? (Array.isArray(body) ? (body[0] as { body?: Record<string, unknown> })?.body : null);
  if (!r || typeof r !== "object") return null;
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = (r as Record<string, unknown>)[k];
      if (typeof v === "string" && v) return v.split("?")[0].replace(/[\r\n]+/g, " ").slice(0, 200);
    }
    return "-";
  };
  return `directive=${pick("effective-directive", "effectiveDirective", "violated-directive")} blocked=${pick("blocked-uri", "blockedURL")} page=${pick("document-uri", "documentURL")} source=${pick("source-file", "sourceFile")}`;
}


export interface CspViolationKey {
  /** The rule that was broken, such as "script-src-elem". */
  directive: string;
  /** What was blocked, cut down to a host or a keyword ("inline", "eval", "data", a host name): never a full address. */
  blocked: string;
  /** The page it happened on, path only. */
  page: string;
}

function hostOf(value: string): string {
  try {
    const u = new URL(value);
    return u.host ? `${u.protocol}//${u.host}`.slice(0, 120) : u.protocol.slice(0, 20);
  } catch {
    return value.slice(0, 40);
  }
}

/** The fields a report page needs, cut down so nothing private (query strings, tokens, full addresses) is ever kept. */
export function parseCspViolation(body: unknown): CspViolationKey | null {
  const r = (body as { "csp-report"?: Record<string, unknown> } | null)?.["csp-report"] ?? (Array.isArray(body) ? (body[0] as { body?: Record<string, unknown> })?.body : null);
  if (!r || typeof r !== "object") return null;
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = (r as Record<string, unknown>)[k];
      if (typeof v === "string" && v) return v;
    }
    return "";
  };
  const directive = get("effective-directive", "effectiveDirective", "violated-directive").split(" ")[0].slice(0, 40);
  if (!directive) return null;
  const blockedRaw = get("blocked-uri", "blockedURL");
  const blocked = !blockedRaw || blockedRaw === "inline" ? "inline" : blockedRaw === "eval" ? "eval" : hostOf(blockedRaw);
  let page = "/";
  try {
    page = new URL(get("document-uri", "documentURL")).pathname.slice(0, 120);
  } catch {
    page = "/";
  }
  return { directive, blocked, page };
}

/**
 * True for reports caused by something on the visitor's own device (a browser extension, a translation tool, an antivirus injecting a
 * script), which no change to the site can or should "fix". Everything else is a real finding to look at before turning enforcement on.
 */
export function isBrowserNoise(v: CspViolationKey): boolean {
  return /^(chrome|moz|safari|ms-browser|edge)-extension:/.test(v.blocked) || v.blocked === "about" || v.blocked === "blob:" || /^(chrome|moz|safari)-/.test(v.blocked);
}

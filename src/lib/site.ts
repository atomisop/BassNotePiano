// ============================================================================
// Canonical site identity — the single source of truth for anything that has
// to agree across metadata, the sitemap, robots.txt and the OG image.
//
// Every one of those surfaces needs the absolute origin, and getting them out
// of sync is the classic way canonical tags start pointing at a Netlify
// preview URL while the sitemap advertises the custom domain. So the origin is
// resolved once, here, in a fixed order of trust:
//
//   1. NEXT_PUBLIC_SITE_URL — set this explicitly in production. It is the
//      only value that survives being read in the browser, which the OG image
//      route and any client-side canonical need.
//   2. NEXTAUTH_URL — already required by next-auth, so on a correctly
//      configured deploy it is right by construction and needs no new env var.
//   3. The production domain — a deliberate last resort. Falling back to
//      localhost would ship `<link rel="canonical" href="http://localhost">`
//      to real crawlers, which is worse than being wrong about the protocol.
// ============================================================================

const FALLBACK_ORIGIN = "https://bassnotepiano.com";

function resolveOrigin(): string {
  const candidate = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXTAUTH_URL;
  if (!candidate) return FALLBACK_ORIGIN;

  // A localhost NEXTAUTH_URL is the normal local-dev value, and it is correct
  // there — but it must never become a canonical URL in a production build.
  try {
    const url = new URL(candidate);
    const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (isLocal && process.env.NODE_ENV === "production") return FALLBACK_ORIGIN;
    return url.origin;
  } catch {
    return FALLBACK_ORIGIN;
  }
}

export const SITE_URL = resolveOrigin();

export const SITE_NAME = "Bass Note Piano";

/** Used as the `title.template` suffix, so pages set only their own name. */
export const SITE_TAGLINE = "Learn Piano, Guitar & Bass";

/**
 * The default social/meta description. Deliberately concrete about what the
 * curriculum actually covers — the scale names are the differentiator and the
 * thing someone would plausibly search for.
 */
export const SITE_DESCRIPTION =
  "Live one-on-one piano, guitar and bass lessons with a real teacher, and a curriculum that opens one scale at a time.";

/** Absolute URL helper — sitemap entries and canonicals both need one. */
export function absoluteUrl(path = "/"): string {
  return new URL(path, SITE_URL).toString();
}

// ---------------------------------------------------------------------------
// Per-page metadata
// ---------------------------------------------------------------------------

/**
 * Builds a page's Metadata with the social tags that must never go missing.
 *
 * This exists because of a genuinely surprising Next.js merge rule: metadata
 * objects are merged *shallowly*, so a page that declares `openGraph` at all
 * replaces the parent's entire `openGraph` — including the `images` entry that
 * the file-based `app/opengraph-image.tsx` convention injects automatically.
 * The same applies to `twitter`, where overriding just the title silently drops
 * `card: "summary_large_image"` back to a small `summary` card.
 *
 * Both failures are invisible in the page source you wrote and only show up in
 * the emitted HTML, so every public page goes through this helper rather than
 * hand-rolling the object and rediscovering the rule.
 */
export function pageMetadata(opts: {
  /** Omit on the homepage, which wants the root layout's `title.default`. */
  title?: string;
  description?: string;
  /** Root-relative, e.g. "/pricing". Becomes both canonical and og:url. */
  path: string;
  /** Legal/boilerplate pages that should stay reachable but never rank. */
  noIndex?: boolean;
}) {
  const { title, description, path, noIndex } = opts;

  // Re-stating the file-convention image explicitly is what survives the
  // shallow merge above. It resolves to an absolute URL via metadataBase.
  const images = ["/opengraph-image"];
  const ogTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} | ${SITE_TAGLINE}`;
  const resolvedDescription = description ?? SITE_DESCRIPTION;

  return {
    ...(title ? { title } : {}),
    description: resolvedDescription,
    alternates: { canonical: path },
    openGraph: {
      type: "website" as const,
      siteName: SITE_NAME,
      locale: "en_US",
      title: ogTitle,
      description: resolvedDescription,
      url: path,
      images,
    },
    twitter: {
      card: "summary_large_image" as const,
      title: ogTitle,
      description: resolvedDescription,
      images,
    },
    ...(noIndex ? { robots: { index: false, follow: true } } : {}),
  };
}

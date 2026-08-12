import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

/**
 * Only the three indexable marketing routes belong here.
 *
 * Everything else in the app is behind auth (see src/middleware.ts and the
 * per-page getServerAuthSession guards) — listing those would advertise URLs
 * that answer every crawler with a redirect to /login, which wastes crawl
 * budget and can be read as soft-404 noise. The auth screens themselves are
 * reachable without a session but have nothing to rank for, so they are
 * deliberately omitted here and disallowed in robots.ts.
 *
 * /terms is public and intentionally absent: it carries `robots: index:false`
 * (legal boilerplate that should never outrank a marketing page), and putting
 * a noindex URL in a sitemap asks a crawler to index the one page you have
 * just told it not to.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    { url: absoluteUrl("/"), lastModified, changeFrequency: "monthly", priority: 1 },
    { url: absoluteUrl("/pricing"), lastModified, changeFrequency: "monthly", priority: 0.9 },
    { url: absoluteUrl("/classes"), lastModified, changeFrequency: "weekly", priority: 0.8 },
  ];
}

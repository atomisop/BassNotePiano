import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

/**
 * The disallow list is not a security boundary — every one of these paths is
 * already enforced server-side by middleware and per-page session checks. It
 * exists so crawlers don't spend their budget on routes that can only ever
 * answer with a redirect to /login, and so the auth screens never surface as
 * search results in place of the marketing pages.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin/",
        "/dashboard",
        "/scales/",
        "/billing/",
        "/account/",
        "/friends/",
        "/messages/",
        "/profile",
        "/lessons",
        "/about",
        "/onboarding",
        "/login",
        "/register",
        "/forgot-password",
        "/reset-password",
        "/verify-email",
      ],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "@/components/ui/appIcons";
import { pageMetadata } from "@/lib/site";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { ShopBrowser } from "@/components/marketing/ShopBrowser";
import { SHOP_PRODUCTS } from "@/lib/shopProducts";
import { BackLink } from "@/components/ui/BackLink";

export const metadata: Metadata = pageMetadata({
  title: "Shop",
  description:
    "Don't have a keyboard or guitar yet? Plain links to Amazon listings we think are reasonable for a first instrument. No account needed, nothing bought here.",
  path: "/shop",
});

/** Only same-site paths are accepted for the back link, so it can't be pointed at another site. */
function safeBackPath(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  return value;
}

export default async function ShopPage(props: { searchParams: Promise<{ back?: string | string[] }> }) {
  const searchParams = await props.searchParams;
  const back = safeBackPath(searchParams.back);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <MarketingNav />

      <main id="main-content" tabIndex={-1} className="outline-none">
        <section className="relative mx-auto max-w-6xl px-6 pb-24 pt-28 md:pt-36">
          {back && (
            <BackLink
              href={back}
              className="tap mb-8 inline-flex items-center gap-2 rounded-full bg-black py-2 pl-3 pr-5 text-small font-medium text-cream transition hover:opacity-80"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </BackLink>
          )}
          {/* One page title; the price caveat is a quiet line under it rather than a boxed notice competing with it. */}
          <h1 className="text-balance font-serif text-hero leading-tight tracking-tight text-slate-50">Gear that works for beginners</h1>
          <p role="note" className="mb-8 mt-3 max-w-2xl text-small text-slate-400">
            Prices shown here are a guide and might be different on Amazon when you look. Some items might not be available.
          </p>

          <ShopBrowser products={SHOP_PRODUCTS} />

          <p className="mt-12 text-small text-slate-500">We&apos;re not affiliated with Amazon and earn nothing from them.</p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

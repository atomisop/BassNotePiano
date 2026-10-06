import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { pageMetadata } from "@/lib/site";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { WordsPullUp } from "@/components/ui/words-pull-up";
import { PillCTA } from "@/components/ui/pill-cta";
import { SHOP_PRODUCTS, type ShopProduct } from "@/lib/shopProducts";

export const metadata: Metadata = pageMetadata({
  title: "Shop",
  description:
    "Don't have a keyboard or guitar yet? Plain links to Amazon listings we think are reasonable for a first instrument. No account needed, nothing bought here.",
  path: "/shop",
});

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** Only same-site paths are accepted for the back link, so it can't be pointed at another site. */
function safeBackPath(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  return value;
}

function ProductCard({ product }: { product: ShopProduct }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl bg-black p-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-white">
        <Image
          src={product.image}
          alt={`${product.brand} ${product.name}`}
          fill
          sizes="(min-width: 1024px) 22vw, (min-width: 640px) 45vw, 90vw"
          className="object-contain p-6"
        />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3 pt-5">
        <p className="text-small uppercase tracking-[0.18em] text-[#E1E0CC]/50">{product.brand}</p>
        <h3 className="text-balance text-body font-medium leading-snug tracking-[-0.01em] text-[#E1E0CC]">{product.name}</h3>
        <p className="text-small leading-relaxed text-[#E1E0CC]/60">{product.blurb}</p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-5">
          <span className="text-xl font-medium tracking-[-0.02em] text-[#E1E0CC]">{formatUsd(product.priceCents)}</span>
          <PillCTA href={product.amazonUrl} external>
            View on Amazon
          </PillCTA>
        </div>
      </div>
    </div>
  );
}

function ProductSection({ title, products }: { title: string; products: ShopProduct[] }) {
  if (products.length === 0) return null;
  return (
    <div className="mt-16 first:mt-0">
      <WordsPullUp text={title} className="text-[clamp(2rem,4.5vw,3.5rem)] font-medium leading-[0.95] tracking-[-0.05em] text-[#E1E0CC]" />
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <ProductCard key={product.slug} product={product} />
        ))}
      </div>
    </div>
  );
}

export default function ShopPage({ searchParams }: { searchParams: { back?: string | string[] } }) {
  const keyboards = SHOP_PRODUCTS.filter((p) => p.category === "keyboard");
  const guitars = SHOP_PRODUCTS.filter((p) => p.category === "guitar");
  const back = safeBackPath(searchParams.back);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <MarketingNav />

      <main id="main-content" tabIndex={-1} className="outline-none">
        <section className="relative mx-auto max-w-6xl px-6 pb-6 pt-28 md:pt-36">
          {back && (
            <Link
              href={back}
              className="tap mb-8 inline-flex items-center gap-2 rounded-full bg-black py-2 pl-3 pr-5 text-small font-medium text-[#E1E0CC] transition hover:opacity-80"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          )}
          <h1>
            <WordsPullUp
              text="Gear that works for beginners"
              className="max-w-[14ch] text-[clamp(2.75rem,9vw,8rem)] font-medium leading-[0.88] tracking-[-0.06em] text-[#E1E0CC]"
            />
          </h1>
          <p className="mt-6 max-w-md text-body leading-relaxed text-[#E1E0CC]/60">
            Plain links to listings we think are reasonable for a first instrument. Nothing is bought here.
          </p>
        </section>

        <section className="relative mx-auto max-w-6xl px-6 pb-24 pt-10">
          <ProductSection title="Keyboards" products={keyboards} />
          <ProductSection title="Guitars" products={guitars} />
          <p className="mt-12 text-small text-slate-500">
            We&apos;re not affiliated with Amazon and earn nothing from them.
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

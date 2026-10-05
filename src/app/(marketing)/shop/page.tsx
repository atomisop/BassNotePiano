import type { Metadata } from "next";
import Image from "next/image";
import { pageMetadata } from "@/lib/site";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { SiteFooter } from "@/components/marketing/SiteFooter";
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

function ExternalArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M7 17L17 7M17 7H8M17 7V16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ProductCard({ product }: { product: ShopProduct }) {
  return (
    <div className="glass-surface flex flex-col overflow-hidden">
      <div className="relative aspect-square w-full bg-slate-50">
        <Image
          src={product.image}
          alt={`${product.brand} ${product.name}`}
          fill
          sizes="(min-width: 1024px) 22vw, (min-width: 640px) 45vw, 90vw"
          className="object-contain p-6"
        />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <p className="text-small font-medium uppercase tracking-[0.15em] text-[rgb(var(--c-s-50))]">{product.brand}</p>
        <h3 className="text-balance font-serif text-body leading-snug text-slate-50">{product.name}</h3>
        <p className="text-small text-slate-400">{product.blurb}</p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <span className="text-body font-semibold text-slate-50">{formatUsd(product.priceCents)}</span>
          <a
            href={product.amazonUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary !h-10 !px-4 !text-small"
          >
            View on Amazon <ExternalArrow />
          </a>
        </div>
      </div>
    </div>
  );
}

function ProductSection({ title, products }: { title: string; products: ShopProduct[] }) {
  if (products.length === 0) return null;
  return (
    <div className="mt-14 first:mt-0">
      <h2 className="font-serif text-body text-slate-50">{title}</h2>
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <ProductCard key={product.slug} product={product} />
        ))}
      </div>
    </div>
  );
}

export default function ShopPage() {
  const keyboards = SHOP_PRODUCTS.filter((p) => p.category === "keyboard");
  const guitars = SHOP_PRODUCTS.filter((p) => p.category === "guitar");

  return (
    <div className="relative min-h-screen overflow-hidden">
      <MarketingNav />

      <main id="main-content" tabIndex={-1} className="outline-none">
        <section className="relative mx-auto max-w-3xl px-6 pb-4 pt-28 text-center">
          <h1 className="text-balance font-serif text-hero leading-tight tracking-[-0.02em] text-slate-50 sm:text-hero">
            Gear that works for beginners
          </h1>
        </section>

        <section className="relative mx-auto max-w-6xl px-6 pb-24 pt-10">
          <ProductSection title="Keyboards" products={keyboards} />
          <ProductSection title="Guitars" products={guitars} />
          <p className="mt-10 text-center text-small text-slate-500">
            Plain links to Amazon. We&apos;re not affiliated with Amazon and earn nothing from them.
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

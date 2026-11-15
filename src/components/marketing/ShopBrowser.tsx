"use client";

import { BlurhashImage } from "@/components/ui/BlurhashImage";
import { useState } from "react";
import Image from "next/image";
import { ArrowUpRight } from "@/components/ui/appIcons";
import type { ShopProduct } from "@/lib/shopProducts";

type Category = "all" | "keyboard" | "guitar";
type PriceBand = "any" | "under120" | "120to150" | "over150";

const CATEGORIES: { id: Category; label: string }[] = [
  { id: "all", label: "All" },
  { id: "keyboard", label: "Keyboards" },
  { id: "guitar", label: "Guitars" },
];

const PRICE_BANDS: { id: PriceBand; label: string; test: (cents: number) => boolean }[] = [
  { id: "any", label: "Any price", test: () => true },
  { id: "under120", label: "Under $120", test: (c) => c < 12000 },
  { id: "120to150", label: "$120 to $150", test: (c) => c >= 12000 && c <= 15000 },
  { id: "over150", label: "Over $150", test: (c) => c > 15000 },
];

function formatUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      // A filter is a choice, not a call to action: the chosen one gets a soft neutral fill and the rest are plain words, so
      // seven chips never outshout the products.
      className={`tap shrink-0 rounded-full px-4 py-2 text-small font-medium transition-colors ${
        active ? "lgx-btn text-cream" : "text-cream/60 hover:text-cream"
      }`}
    >
      {children}
    </button>
  );
}

function ProductCard({ product }: { product: ShopProduct }) {
  return (
    <div className="lgx-card flex flex-col overflow-hidden rounded-2xl p-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-white">
        <BlurhashImage
          src={product.image}
          alt={`${product.brand} ${product.name}`}
          sizes="(min-width: 1024px) 22vw, (min-width: 640px) 45vw, 90vw"
          className="object-contain p-6"
        />
      </div>
      {/* What it is (brand eyebrow, name), one quiet line on why, then the price as the one figure and a quiet way out to
          Amazon. Every card used to carry a solid orange button, so a page of them was a page of equal shouting. */}
      <div className="flex flex-1 flex-col p-3 pt-5">
        <p className="text-caption font-medium uppercase tracking-caps text-cream/55">{product.brand}</p>
        <h2 className="mt-1 text-balance text-body font-semibold leading-snug text-cream">{product.name}</h2>
        <p className="mb-5 mt-2 text-small leading-relaxed text-cream/60">{product.blurb}</p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-cream/10 pt-4">
          <span className="text-title font-semibold tabular-nums text-cream">{formatUsd(product.priceCents)}</span>
          <a
            href={product.amazonUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="lgx-btn tap inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-small font-semibold text-cream transition-colors"
          >
            View on Amazon
            <ArrowUpRight aria-hidden className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}

export function ShopBrowser({ products }: { products: ShopProduct[] }) {
  const [category, setCategory] = useState<Category>("all");
  const [band, setBand] = useState<PriceBand>("any");

  const test = PRICE_BANDS.find((b) => b.id === band)!.test;
  const shown = products.filter((p) => (category === "all" || p.category === category) && test(p.priceCents));

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label="Type" className="-m-3 flex gap-2 overflow-x-auto p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CATEGORIES.map((c) => (
            <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
              {c.label}
            </Chip>
          ))}
        </div>
        <div role="group" aria-label="Price" className="-m-3 flex gap-2 overflow-x-auto p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {PRICE_BANDS.map((b) => (
            <Chip key={b.id} active={band === b.id} onClick={() => setBand(b.id)}>
              {b.label}
            </Chip>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="mt-12 text-body text-cream/60">Nothing matches those filters. Try another price range.</p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}

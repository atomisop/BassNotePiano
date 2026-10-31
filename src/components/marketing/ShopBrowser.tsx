"use client";

import { BlurhashImage } from "@/components/ui/BlurhashImage";
import { useState } from "react";
import Image from "next/image";
import { PillCTA } from "@/components/ui/pill-cta";
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
      className={`tap shrink-0 rounded-full px-4 py-2 text-small font-medium transition ${
        active ? "bg-amber-400 text-black shadow-pressed-low" : "neu-btn !text-cream/80 hover:!text-cream"
      }`}
    >
      {children}
    </button>
  );
}

function ProductCard({ product }: { product: ShopProduct }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl bg-black p-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-white">
        <BlurhashImage
          src={product.image}
          alt={`${product.brand} ${product.name}`}
          sizes="(min-width: 1024px) 22vw, (min-width: 640px) 45vw, 90vw"
          className="object-contain p-6"
        />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3 pt-5">
        <p className="text-small uppercase tracking-caps text-cream/60">{product.brand}</p>
        <h2 className="text-balance text-body font-medium leading-snug tracking-tight text-cream">{product.name}</h2>
        <p className="text-small leading-relaxed text-cream/60">{product.blurb}</p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-5">
          <span className="text-xl font-medium tracking-tight text-cream">{formatUsd(product.priceCents)}</span>
          <PillCTA href={product.amazonUrl} external className="px-4 text-sm sm:px-5">
            View on Amazon
          </PillCTA>
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

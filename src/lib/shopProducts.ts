// Plain product links for students who don't have an instrument yet,
// requested directly by the studio owner: one link per real Amazon listing.
// No Associates/affiliate tag: these are the studio owner's own share links
// with the tracking parameters stripped, not a monetized program. If that
// changes later, `amazonUrl` is the one place a `?tag=` would get added.
//
// Images live in /public/shop, downloaded once from each listing's own
// product photo (see the commit that added this file) rather than
// hotlinked, so the page never breaks if Amazon reshuffles a CDN path.

export interface ShopProduct {
  slug: string;
  category: "keyboard" | "guitar";
  brand: string;
  name: string;
  blurb: string;
  priceCents: number;
  image: string;
  amazonUrl: string;
}

export const SHOP_PRODUCTS: ShopProduct[] = [
  {
    slug: "rockjam-rj361",
    category: "keyboard",
    brand: "RockJam",
    name: "RJ361 61-Key Compact Keyboard",
    blurb: "61 keys in a compact, lightweight body. A good first keyboard if space is tight.",
    priceCents: 11999,
    image: "/shop/rockjam-rj361.jpg",
    amazonUrl: "https://www.amazon.com/dp/B07FDL3NGT",
  },
  {
    slug: "rockjam-rj5061",
    category: "keyboard",
    brand: "RockJam",
    name: "RJ5061 61-Key Keyboard Kit with Stand, Bench & Headphones",
    blurb: "Same idea, but the kit throws in a stand, bench, and headphones so there's nothing extra to buy.",
    priceCents: 13999,
    image: "/shop/rockjam-rj5061.jpg",
    amazonUrl: "https://www.amazon.com/dp/B083ZCWWWK",
  },
  {
    slug: "veiyoumo-61key",
    category: "keyboard",
    brand: "VEIYOUMO",
    name: "61-Key Keyboard with Stand, Bench & Lighted Keys",
    blurb: "A full kit at the lowest price here, with lighted keys for following along.",
    priceCents: 9999,
    image: "/shop/veiyoumo-61key.jpg",
    amazonUrl: "https://www.amazon.com/dp/B0D3PQL8GQ",
  },
  {
    slug: "amazonbasics-61key",
    category: "keyboard",
    brand: "Amazon Basics",
    name: "61-Key Portable Keyboard",
    blurb: "No bundle, no lights, just a plain, reliable 61-key keyboard.",
    priceCents: 14900,
    image: "/shop/amazonbasics-61key.jpg",
    amazonUrl: "https://www.amazon.com/dp/B0BFRD9P8H",
  },
  {
    slug: "vangoa-guitar",
    category: "guitar",
    brand: "Vangoa",
    name: "36\" Acoustic-Electric Guitar (3/4 Size)",
    blurb: "3/4 size, worth considering for a smaller player or a first guitar.",
    priceCents: 13599,
    image: "/shop/vangoa-guitar.jpg",
    amazonUrl: "https://www.amazon.com/dp/B08DR4Q584",
  },
  {
    slug: "moukey-guitar",
    category: "guitar",
    brand: "Moukey",
    name: "41\" Acoustic Guitar Beginner Bundle",
    blurb: "Full size, with a gig bag, tuner, strap, and capo included.",
    priceCents: 10999,
    image: "/shop/moukey-guitar.jpg",
    amazonUrl: "https://www.amazon.com/dp/B09DYFNZW7",
  },
  {
    slug: "donner-daj110cd",
    category: "guitar",
    brand: "Donner",
    name: "DAJ-110CD 40\" Acoustic-Electric Guitar Bundle",
    blurb: "Built-in pickup, so it's ready to plug in if you ever want to.",
    priceCents: 14999,
    image: "/shop/donner-daj110cd.jpg",
    amazonUrl: "https://www.amazon.com/dp/B08YYMJKG5",
  },
  {
    slug: "donner-dag1c",
    category: "guitar",
    brand: "Donner",
    name: "DAG-1C 41\" Acoustic Guitar Bundle",
    blurb: "Full-size steel-string bundle with the same beginner extras included.",
    priceCents: 16999,
    image: "/shop/donner-dag1c.jpg",
    amazonUrl: "https://www.amazon.com/dp/B073XC3Y5J",
  },
  {
    slug: "kadence-a06eq",
    category: "guitar",
    brand: "Kadence",
    name: "A06EQ-SC 40\" Electro-Acoustic Guitar",
    blurb: "Grand auditorium cutaway with a built-in pickup and 2-band EQ.",
    priceCents: 16699,
    image: "/shop/kadence-a06eq.jpg",
    amazonUrl: "https://www.amazon.com/dp/B09BVH7BMJ",
  },
];

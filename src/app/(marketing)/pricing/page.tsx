import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import { PricingPageContent } from "@/components/marketing/PricingPageContent";
import { getPricingForDisplay } from "@/lib/pricing";

export const metadata: Metadata = pageMetadata({
  title: "Pricing",
  description:
    "Live one-on-one classes on Discord, 45 minutes a week. Plans from $45 a class on a 6 month plan.",
  path: "/pricing",
});

export default async function Page() {
  const { config, stale } = await getPricingForDisplay();
  return (
    <>
      {stale && (
        <p role="status" className="mx-auto max-w-2xl px-6 pt-24 text-center text-small text-amber-300">
          We could not load our latest prices just now, so these may be out of date. You will always see the exact price before you pay.
        </p>
      )}
      <PricingPageContent pricing={config} />
    </>
  );
}

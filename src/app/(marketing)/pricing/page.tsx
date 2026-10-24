import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import { PricingPageContent } from "@/components/marketing/PricingPageContent";
import { getPricingConfig } from "@/lib/pricing";

export const metadata: Metadata = pageMetadata({
  title: "Pricing",
  description:
    "Live one-on-one classes on Discord, 45 minutes a week, with the full curriculum included. Plans from $45 a class on a 6 month plan.",
  path: "/pricing",
});

export default async function Page() {
  return <PricingPageContent pricing={await getPricingConfig()} />;
}

import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import { PricingPageContent } from "@/components/marketing/PricingPageContent";

export const metadata: Metadata = pageMetadata({
  title: "Pricing",
  description:
    "One payment unlocks the full six-scale kiñit curriculum for life, no subscription. Live group classes on Zoom are bought separately as class credits, discounted by the bundle.",
  path: "/pricing",
});

export default function Page() {
  return <PricingPageContent />;
}

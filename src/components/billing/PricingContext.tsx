"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_PRICING, type PricingConfig } from "@/lib/classCreditPricing";

interface PricingValue {
  pricing: PricingConfig;
  /** This account's personal percent off a solo plan (set by the owner on Admin > Pricing); 0 when none. */
  personalDiscountPercent: number;
  /** A claimed scholarship's percent off: it prices the 6 Month plan only (see discountPercentForTerm). */
  scholarshipPercent: number;
}

const Ctx = createContext<PricingValue>({ pricing: DEFAULT_PRICING, personalDiscountPercent: 0, scholarshipPercent: 0 });

/** The owner's current prices and this account's own discount, for client screens deep in the app that price a plan (read with usePricing). */
export function PricingProvider({ pricing, personalDiscountPercent, scholarshipPercent, children }: PricingValue & { children: ReactNode }) {
  return <Ctx.Provider value={{ pricing, personalDiscountPercent, scholarshipPercent }}>{children}</Ctx.Provider>;
}

export function usePricing(): PricingValue {
  return useContext(Ctx);
}

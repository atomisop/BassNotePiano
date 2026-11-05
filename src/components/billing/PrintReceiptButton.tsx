"use client";

import { buttonVariants } from "@/components/ui/button";

/** Opens the browser's print sheet; globals.css (.print-only-receipt) prints the receipt alone, on white. */
export function PrintReceiptButton() {
  return (
    <button type="button" onClick={() => window.print()} className={buttonVariants({ variant: "secondary", size: "lg" })}>
      Print or save as PDF
    </button>
  );
}

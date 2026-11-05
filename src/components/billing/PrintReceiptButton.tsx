"use client";

import { Button } from "@/components/ui/button";

/** Opens the browser's print sheet; globals.css (.print-only-receipt) prints the receipt alone, on white. */
export function PrintReceiptButton() {
  return (
    <Button type="button" onClick={() => window.print()} variant="secondary" size="lg">
      Print or save as PDF
    </Button>
  );
}

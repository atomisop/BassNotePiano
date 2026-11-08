import { describe, expect, it } from "vitest";
import { buttonVariants, GLASS_BUTTON_VARIANTS } from "@/components/ui/button";
import { GLASS_SELECTOR } from "@/components/layout/GlassButtons";

const VARIANTS = ["default", "primary", "paper", "secondary", "outline", "ghost", "destructive", "danger", "link", "glass"] as const;

describe("the shared Button says when it is glass", () => {
  it("lists exactly the variants whose resting classes are glass (liquid or liquid-signal)", () => {
    for (const v of VARIANTS) {
      const tokens = buttonVariants({ variant: v }).split(/\s+/);
      const glassAtRest = tokens.includes("liquid") || tokens.includes("liquid-signal");
      expect(GLASS_BUTTON_VARIANTS.includes(v), `variant ${v}`).toBe(glassAtRest);
    }
  });

  it("is picked up by the lens selector", () => {
    expect(GLASS_SELECTOR).toContain('[data-glass-role="button"]');
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RollingNumber } from "@/components/ui/RollingNumber";

function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

describe("RollingNumber", () => {
  it("puts the price in the page text exactly once", () => {
    const html = renderToStaticMarkup(createElement(RollingNumber, { text: "$59.99" }));
    expect(textOf(html).match(/\$59\.99/g)).toHaveLength(1);
  });
  it("leaves no reel digits (0123456789) in the text", () => {
    const html = renderToStaticMarkup(createElement(RollingNumber, { text: "$1,234.50" }));
    expect(textOf(html)).not.toMatch(/0123/);
  });
  it("hides the animated copy from assistive technology", () => {
    const html = renderToStaticMarkup(createElement(RollingNumber, { text: "$9.99" }));
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("sr-only");
  });
});

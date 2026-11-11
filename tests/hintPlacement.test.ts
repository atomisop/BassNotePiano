import { describe, expect, it } from "vitest";
import { HINT_GAP, HINT_MARGIN, HINT_WIDTH, hintWidth, placeHint, type Box } from "@/lib/hintPlacement";

const phone = { width: 390, height: 844 };
const icon = (left: number, top: number): Box => ({ left, top, right: left + 24, bottom: top + 24 });
const size = { width: 256, height: 80 };

function onScreen(p: { left: number; top: number }, s: { width: number; height: number }, v: { width: number; height: number }) {
  return p.left >= HINT_MARGIN && p.top >= HINT_MARGIN && p.left + s.width <= v.width - HINT_MARGIN && p.top + s.height <= v.height - HINT_MARGIN;
}

describe("placeHint", () => {
  it("opens below and to the right of an icon on the left, as before", () => {
    const p = placeHint(icon(40, 200), size, phone);
    expect(p.left).toBe(40);
    expect(p.top).toBe(224 + HINT_GAP);
    expect(p.side).toBe("bottom");
    expect(p.maxHeight).toBeNull();
  });

  it("slides left so an icon near the right edge of a phone stays on the screen", () => {
    const p = placeHint(icon(340, 200), size, phone);
    expect(p.left).toBe(390 - HINT_MARGIN - 256);
    expect(onScreen(p, size, phone)).toBe(true);
  });

  it("keeps a right-aligned popover from running off the left edge", () => {
    const p = placeHint(icon(10, 200), size, phone, "bottom", "right");
    expect(p.left).toBe(HINT_MARGIN);
  });

  it("centers on the icon when there is room, and clamps when there is not", () => {
    expect(placeHint(icon(180, 200), size, phone, "bottom", "center").left).toBe(192 - 128);
    expect(placeHint(icon(2, 200), size, phone, "bottom", "center").left).toBe(HINT_MARGIN);
    expect(placeHint(icon(364, 200), size, phone, "bottom", "center").left).toBe(390 - HINT_MARGIN - 256);
  });

  it("flips above the icon when there is no room below and more room above", () => {
    const p = placeHint(icon(40, 800), size, phone);
    expect(p.side).toBe("top");
    expect(p.top).toBe(800 - HINT_GAP - 80);
    expect(onScreen(p, size, phone)).toBe(true);
  });

  it("flips below an icon at the very top when asked to open above", () => {
    const p = placeHint(icon(40, 8), size, phone, "top");
    expect(p.side).toBe("bottom");
    expect(p.top).toBe(32 + HINT_GAP);
  });

  it("stays on the requested side when that side fits", () => {
    expect(placeHint(icon(40, 500), size, phone, "top").side).toBe("top");
  });

  it("holds a popover as wide as the screen allows on a very narrow phone", () => {
    expect(hintWidth(320)).toBe(HINT_WIDTH);
    expect(hintWidth(390)).toBe(HINT_WIDTH);
    expect(hintWidth(260)).toBe(236);
    const narrow = { width: 260, height: 640 };
    const s = { width: hintWidth(260), height: 90 };
    const p = placeHint(icon(230, 300), s, narrow);
    expect(onScreen(p, s, narrow)).toBe(true);
  });

  it("limits the height, and scrolls inside it, when the popover is taller than the screen", () => {
    const tall = { width: 256, height: 900 };
    const p = placeHint(icon(40, 400), tall, phone);
    expect(p.maxHeight).toBe(844 - HINT_MARGIN * 2);
    expect(p.top).toBe(HINT_MARGIN);
  });

  it("keeps every icon position on a phone on the screen", () => {
    for (const side of ["bottom", "top"] as const) {
      for (const align of ["left", "right", "center"] as const) {
        for (let x = 0; x <= 366; x += 9) {
          for (let y = 0; y <= 820; y += 41) {
            const p = placeHint(icon(x, y), size, phone, side, align);
            expect(onScreen(p, size, phone)).toBe(true);
          }
        }
      }
    }
  });
});

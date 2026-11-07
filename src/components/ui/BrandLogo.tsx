// The Bass Note Piano logo. Two forms, both from public/brand:
//  - BrandLogo: the BNP mark alone, painted in the surrounding text colour (a CSS mask), so it is
//    cream on Ink and dark on Paper with nothing to switch.
//  - BrandLockup: the mark with the name and the orange rule under it, as two images, one per theme.
// The mark's picture is 789 by 496, so a box of aspect 1.59 shows it with no empty margin.
export const BRAND_MARK_RATIO = 789 / 496;
export const BRAND_LOCKUP_RATIO = 901 / 645;

export function BrandLogo({ height = 28, className = "" }: { height?: number; className?: string }) {
  const width = Math.round(height * BRAND_MARK_RATIO);
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 bg-current ${className}`}
      style={{
        width,
        height,
        WebkitMaskImage: 'url("/brand/mark-ink.png")',
        maskImage: 'url("/brand/mark-ink.png")',
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}

export function BrandLockup({ height = 96, className = "", priority = false }: { height?: number; className?: string; priority?: boolean }) {
  const width = Math.round(height * BRAND_LOCKUP_RATIO);
  const common = { width, height, decoding: "async" as const, loading: priority ? ("eager" as const) : ("lazy" as const) };
  return (
    <span aria-hidden className={`inline-block shrink-0 ${className}`} style={{ width, height }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img {...common} alt="" src="/brand/lockup-ink.png" className="brand-for-paper h-full w-full" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img {...common} alt="" src="/brand/lockup-cream.png" className="brand-for-ink h-full w-full" />
    </span>
  );
}

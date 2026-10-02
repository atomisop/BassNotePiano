import Image from "next/image";
import { NarrowLayout } from "@/components/layout/PageLayouts";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(ellipse_at_top,_rgba(160,78,30,0.07),_transparent_60%)]"
      />
      <header className="relative flex items-center gap-2.5 px-6 py-6">
        <Image src="/logo-mark.png" alt="" width={26} height={26} className="h-[26px] w-[26px] rounded-[6px]" priority />
        {/* Same wordmark treatment as MarketingNav's own (bold, lowercase).
            This was still the pre-Pianote-pass uppercase/split-color
            version. Fully accent-colored at the time; neutral again now
            under the "premium black and white" pass. */}
        <span className="font-serif text-sm font-bold lowercase tracking-[-0.01em] text-[rgb(var(--c-s-50))]">
          Bass Note Piano
        </span>
      </header>
      <main className="relative flex flex-1 items-center justify-center px-6 pb-16">
        <NarrowLayout>{children}</NarrowLayout>
      </main>
    </div>
  );
}

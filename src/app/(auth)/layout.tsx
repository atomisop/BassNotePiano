import Image from "next/image";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    // The photo backdrop that used to fill this shell is gone by direct
    // instruction (moved to the homepage instead, see InstrumentPicker/
    // ProblemStatement's own comments). The ground now comes straight from
    // <body>'s own bg-slate-950, same plain dark surface every other
    // chrome-free area of the app already sits on.
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6 py-16">
      {/* header, not a bare <a>: axe's "region" check flagged this brand
          link for sitting outside any landmark, as a sibling of <main>
          rather than inside one. */}
      <header>
        <Link href="/" className="relative mb-8 flex flex-col items-center text-center">
          <Image src="/logo-mark.png" alt="" width={44} height={44} className="mb-2 h-11 w-11 rounded-[8px]" priority />
          {/* Same wordmark treatment as MarketingNav's own (bold, lowercase,
              fully accent-colored). This was still the pre-Pianote-pass
              title-case/split-color version. */}
          <p className="font-serif text-2xl font-bold lowercase tracking-[-0.01em] text-[rgb(var(--c-a-400))]">
            Bass Note Piano
          </p>
          <p className="mt-1 text-sm text-slate-400">Ethiopian scale theory, practiced.</p>
        </Link>
      </header>
      <main className="relative flex w-full justify-center">{children}</main>
    </div>
  );
}

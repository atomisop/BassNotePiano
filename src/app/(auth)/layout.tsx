import Image from "next/image";
import Link from "next/link";
import { ArrowLeftIcon } from "@/components/ui/icons";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    // The photo backdrop that used to fill this shell is gone by direct
    // instruction (moved to the homepage instead, see InstrumentPicker/
    // ProblemStatement's own comments). The ground now comes straight from
    // <body>'s own bg-slate-950, same plain dark surface every other
    // chrome-free area of the app already sits on.
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6 py-16">
      {/* Login and register are the top of their own flow, with nothing
          else on-page to signal a way out: the brand lockup below is a
          real link, but a logo alone doesn't read as "click this to leave"
          to a visitor who isn't already fluent in that web convention. An
          explicit corner link says so directly, on every auth screen at
          once, without disturbing the centered brand moment. */}
      <Link
        href="/"
        className="absolute left-4 top-4 flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-300 sm:left-6 sm:top-6"
      >
        <ArrowLeftIcon size={16} />
        Back to homepage
      </Link>
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

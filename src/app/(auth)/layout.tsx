import { BrandLockup } from "@/components/ui/BrandLogo";
import Link from "next/link";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { PageHitBeacon } from "@/components/marketing/PageHitBeacon";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    // The photo backdrop that used to fill this shell is gone by direct
    // instruction (moved to the homepage instead, see InstrumentPicker/
    // ProblemStatement's own comments). The ground now comes straight from
    // <body>'s own bg-slate-950, same plain dark surface every other
    // chrome-free area of the app already sits on.
    //
    // `min-h-[100svh]`, not `min-h-screen` (100vh), the same mobile-Safari
    // fix as the marketing Hero (see that component's own comment on this):
    // `vh` sizes against the tallest the browser chrome ever gets (address
    // bar collapsed), `svh` against the smallest guaranteed-visible height
    // (address bar showing, the common case on load). `min-h-screen` here
    // claimed more height than was actually visible on a real phone, so
    // this centered shell, logo header plus a form-heavy card like
    // /reset-password's, no short content on this route group, needed a
    // scroll to reach the whole thing even though nothing was genuinely
    // overflowing, just the shell itself over-claiming space no phone
    // screen actually had. Reported live as unwanted scroll on the
    // password-reset screen specifically, but every page in this layout
    // shared the same shell, so the fix applies to all of them at once.
    //
    // `py-16` (64px top+bottom = 128px) was most of the remaining overflow
    // even after the svh fix above, `min-height` only sets a floor, it
    // doesn't shrink content that's genuinely taller than one screen, and
    // this shell's own fixed padding was a big, unconditional chunk of
    // that height on every auth page regardless of how tall its card is.
    // Cut to a quarter on narrow/short phones specifically (`sm:py-16`
    // keeps the original spacious feel everywhere else, this only tightens
    // where a real device measurement showed it was actually needed); the
    // reset-password card's own internal spacing is trimmed the same way,
    // see that page.
    //
    // The scroll container is this layout itself (fixed to the screen, its own
    // overflow-y-auto), not the page. `data-surface="app"` locks the document
    // from scrolling (globals.css: the signed-in app is one fixed screen), and
    // this shell used to rely on page scroll, so any form taller than a phone
    // screen, the Create account form most of all, could not be scrolled to
    // the bottom. Now the form scrolls inside its own box, with the content
    // still centered whenever it fits.
    <div data-surface="app" className="kb-fit fixed inset-0 overflow-y-auto overscroll-contain">
      <PageHitBeacon />
      <div className="relative flex min-h-full flex-col items-center justify-center px-6 py-6 sm:py-16">
      {/* Login and register are the top of their own flow, with nothing
          else on-page to signal a way out: the brand lockup below is a
          real link, but a logo alone doesn't read as "click this to leave"
          to a visitor who isn't already fluent in that web convention. An
          explicit corner link says so directly, on every auth screen at
          once, without disturbing the centered brand moment. */}
      <nav aria-label="Back to homepage">
      <Link
        href="/"
        className="tap absolute left-4 top-4 flex items-center gap-1.5 text-small text-slate-500 transition hover:text-slate-300 sm:left-6 sm:top-6"
      >
        <ArrowLeftIcon size={16} />
        {/* "to homepage" hidden below `sm`, this link is `absolute`, so it
            never claims flow height and can't push a shorter viewport into
            a scroll, but it also can't push anything else out of ITS way:
            at the narrowest real phone widths (an SE-class 320px) the full
            label's own width ran right into the centered logo below it,
            each painted independently with no shared layout to keep them
            apart. Shortening the label is the fix, not more clearance,
            adding vertical space back here would undo the point of trimming
            this shell down to begin with. */}
        Back<span className="hidden sm:inline">&nbsp;to homepage</span>
      </Link>
      </nav>
      {/* header, not a bare <a>: axe's "region" check flagged this brand
          link for sitting outside any landmark, as a sibling of <main>
          rather than inside one. */}
      <header>
        <Link href="/" aria-label="Bass Note Piano, home" className="relative mb-3 flex flex-col items-center text-center sm:mb-8">
          <BrandLockup height={112} className="mb-1" priority />
          {/* Hidden below `sm` specifically, the one purely decorative line
              here, so it's the first thing to give way on the shortest
              phone screens where the reset-password card's own three
              fields leave the least room to spare. */}
          <p className="mt-1 hidden text-small text-slate-400 sm:block">Ethiopian scale theory, practiced.</p>
        </Link>
      </header>
      <main className="relative flex w-full justify-center">{children}</main>
      </div>
    </div>
  );
}

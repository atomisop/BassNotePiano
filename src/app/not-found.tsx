import Link from "next/link";

/**
 * App-wide 404.
 *
 * Self-contained rather than reusing <MarketingNav>: this renders directly
 * inside the root layout, and it has to work for a signed-out visitor
 * mistyping a marketing URL *and* for a signed-in student following a stale
 * link, without knowing which it is. A nav with the wrong auth state on it
 * would be worse than none.
 *
 * The links out are the three routes that are always valid regardless of
 * session, a dead end with no exit is the thing worth avoiding here.
 */
export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-start justify-center px-6 py-20">
      <p className="eyebrow">404</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-2 leading-tight text-slate-50">
        That page isn&apos;t here.
      </h1>
      <p className="mt-4 text-body text-slate-400">
        The link may be out of date, or the address slightly off.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link
          href="/"
          className="cta-sheen cta-fill rounded-full px-5 py-2.5 text-small font-semibold"
        >
          Back to the homepage
        </Link>
        <Link
          href="/dashboard"
          className="rounded-full border border-[rgb(var(--c-s-50)/0.4)] px-5 py-2.5 text-small font-medium text-[rgb(var(--c-s-50))] transition hover:border-[rgb(var(--c-s-50))] hover:bg-[rgb(var(--c-s-50)/0.1)]"
        >
          Go to my dashboard
        </Link>
      </div>

      <p className="mt-10 text-small text-slate-500">
        Looking for the curriculum?{" "}
        <Link href="/pricing" className="text-[rgb(var(--c-s-50))] underline underline-offset-4">
          See what&apos;s included
        </Link>
        .
      </p>
    </main>
  );
}

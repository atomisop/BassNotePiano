import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerAuthSession } from "@/lib/auth";
import { MIN_CUSTOM_QUANTITY, MAX_CUSTOM_QUANTITY } from "@/lib/classCreditPricing";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { ClassCreditPurchaseFlow } from "./ClassCreditPurchaseFlow";

export default async function BillingLessonsPage({ searchParams }: { searchParams: { quantity?: string; mode?: string } }) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/lessons");
  // Class credits are an add-on to the curriculum, not a standalone
  // purchase. Buy the $69.99 curriculum first, credits after.
  if (!session.user.hasCurriculumAccess) redirect("/billing/curriculum?next=credits");

  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";

  // Lets a "Buy credits" button on the pricing page (e.g. ?quantity=20 for
  // Best Value) land the picker already on that bundle instead of always
  // defaulting to Starter and making the student reselect it themselves.
  const parsedQuantity = Number(searchParams.quantity);
  const initialQuantity = Number.isInteger(parsedQuantity)
    ? Math.min(MAX_CUSTOM_QUANTITY, Math.max(MIN_CUSTOM_QUANTITY, parsedQuantity))
    : undefined;
  const initialMode = searchParams.mode === "family" ? "family" : "individual";

  return (
    // Two columns once there's room for them (lg+): a plain-language info
    // panel on the left, the actual purchase card on the right. Below lg it
    // collapses to one column, info first. This used to be a single
    // max-w-sm column with the purchase card alone in it, fine for the
    // original 2-bundle-tile picker, but the family bundle's recipient list
    // needs real width to lay out without every button/input touching the
    // next one, and a lone narrow card floating on an otherwise-empty wide
    // page looked unfinished once the rest of the app got fuller.
    <div className="w-full max-w-5xl lg:grid lg:grid-cols-12 lg:gap-12">
      {/* The "Buy credits" CTA on /lessons is this page's real, primary
          entry point (also linked from pricing/account, but booking is
          where running low on credits actually comes up). */}
      <Link
        href="/lessons"
        className="mb-4 flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-slate-100 lg:col-span-12"
      >
        <ArrowLeftIcon size={16} />
        Back to classes
      </Link>
      <div className="lg:col-span-5">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-a-400)/0.8)]">Weekly Classes</p>
        <h1 className="mt-1.5 font-serif text-3xl text-slate-50">Buy class credits</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          1 credit = 30 minutes of live class. $34.99/credit, and Starter, Standard, and Best Value are all marked down
          from the $50/credit rate for a limited time, with bigger bundles saving more. Credits never expire.
        </p>
        <div className="mt-6 space-y-3 border-t border-ink/10 pt-6 text-sm text-slate-400">
          <p className="font-medium text-slate-300">Buying for more than one kid?</p>
          <p className="leading-relaxed">
            Switch to <span className="text-[rgb(var(--c-a-300))]">Family bundle</span> on the right. The same tier applied to
            2 or more separate accounts at once gets an extra 25% off the combined total, also for a limited time. Each
            recipient needs their own Bass Note Piano account already, since the credits land directly on their account,
            not yours.
          </p>
        </div>
      </div>

      <div className="mt-8 lg:col-span-7 lg:mt-0">
        <ClassCreditPurchaseFlow zelleHandle={zelleHandle} initialQuantity={initialQuantity} initialMode={initialMode} />
      </div>
    </div>
  );
}

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/button";
import { isEmailCategory, UNSUBSCRIBE_CATEGORY_LABEL, UNSUBSCRIBE_CATEGORY_NOTE, verifyUnsubscribeToken } from "@/lib/unsubscribe";

export const metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };

/**
 * Where the "Unsubscribe" link in an email lands. It only ASKS: nothing changes until the button is pressed (a mail scanner that
 * opens every link must not unsubscribe anyone). No sign-in is needed; the link itself proves it was made for this person.
 */
export default async function UnsubscribePage(props: { searchParams: Promise<{ u?: string; c?: string; t?: string; done?: string; bad?: string }> }) {
  const { u = "", c = "", t = "", done, bad } = await props.searchParams;

  if (done && isEmailCategory(done)) {
    return (
      <Card className="mx-auto max-w-md">
        <h1 className="text-body font-semibold text-slate-50">You are unsubscribed</h1>
        <p className="mt-2 text-small text-slate-300">You will no longer get emails about {UNSUBSCRIBE_CATEGORY_LABEL[done]}.</p>
        <p className="mt-2 text-small text-slate-400">
          Changed your mind? You can turn any email back on under Settings, Notification settings. Sign-in codes and security alerts are always sent.
        </p>
        <Link href="/account?tab=notifications" className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-4" })}>
          Open notification settings
        </Link>
      </Card>
    );
  }

  if (bad || !verifyUnsubscribeToken(u, c, t)) {
    return (
      <Card className="mx-auto max-w-md">
        <h1 className="text-body font-semibold text-slate-50">This link is not valid</h1>
        <p className="mt-2 text-small text-slate-300">It may have been cut short when it was copied. You can switch any email off yourself under Settings, Notification settings.</p>
        <Link href="/account?tab=notifications" className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-4" })}>
          Open notification settings
        </Link>
      </Card>
    );
  }

  const category = c as keyof typeof UNSUBSCRIBE_CATEGORY_LABEL;
  const note = UNSUBSCRIBE_CATEGORY_NOTE[category];
  return (
    <Card className="mx-auto max-w-md">
      <h1 className="text-body font-semibold text-slate-50">Stop these emails?</h1>
      <p className="mt-2 text-small text-slate-300">You will stop getting emails about {UNSUBSCRIBE_CATEGORY_LABEL[category]}. Sign-in codes and security alerts are always sent.</p>
      {note && <p className="mt-2 text-small text-amber-300">{note}</p>}
      <form method="post" action="/api/unsubscribe" className="mt-4 flex flex-wrap gap-2">
        <input type="hidden" name="u" value={u} />
        <input type="hidden" name="c" value={c} />
        <input type="hidden" name="t" value={t} />
        <input type="hidden" name="from" value="page" />
        <button type="submit" className={buttonVariants({ variant: "primary", size: "sm" })}>
          Unsubscribe
        </button>
        <Link href="/" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          Keep them
        </Link>
      </form>
    </Card>
  );
}

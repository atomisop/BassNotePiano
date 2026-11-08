import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { maskEmail, recipientTag, RECIPIENT_HINT_PARAM, RECIPIENT_PARAM } from "@/lib/recipientTag";
import { isEmailCategory, UNSUBSCRIBE_CATEGORY_LABEL, UNSUBSCRIBE_CATEGORY_NOTE, verifyUnsubscribeToken } from "@/lib/unsubscribe";
import { Hint } from "@/components/ui/Hint";

export const metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };

/**
 * The link to this person's notification settings, made for THEIR address (the same "who is this for" tag every emailed link
 * carries), so whoever clicks it while signed in as someone else is stopped with the "sign in with the right account" screen
 * instead of being shown that other account's settings.
 */
async function settingsLinkFor(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const tag = user ? await recipientTag(user.email) : null;
  if (!user || !tag) return "/account?tab=notifications";
  const q = new URLSearchParams({ tab: "notifications", [RECIPIENT_PARAM]: tag, [RECIPIENT_HINT_PARAM]: maskEmail(user.email) });
  return `/account?${q.toString()}`;
}

/**
 * Where the "Unsubscribe" link in an email lands. It only ASKS: nothing changes until the button is pressed (a mail scanner that
 * opens every link must not unsubscribe anyone). No sign-in is needed; the link itself proves it was made for this person.
 */
export default async function UnsubscribePage(props: { searchParams: Promise<{ u?: string; c?: string; t?: string; done?: string; bad?: string }> }) {
  const { u = "", c = "", t = "", done, bad } = await props.searchParams;

  if (done && isEmailCategory(done)) {
    const settingsHref = verifyUnsubscribeToken(u, done, t) ? await settingsLinkFor(u) : "/account?tab=notifications";
    return (
      <Card className="mx-auto max-w-md">
        <h1 className="text-title font-semibold text-slate-50">You are unsubscribed</h1>
        <p className="mt-2 text-small text-slate-300">You will no longer get emails about {UNSUBSCRIBE_CATEGORY_LABEL[done]}.</p>
        <p className="mt-2 text-small text-slate-400"><Hint>Changed your mind? You can turn any email back on under Settings, Notification settings. Sign-in codes and security alerts are always sent.</Hint></p>
        <Link href={settingsHref} className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-4" })}>
          Open notification settings
        </Link>
      </Card>
    );
  }

  if (bad || !verifyUnsubscribeToken(u, c, t)) {
    return (
      <Card className="mx-auto max-w-md">
        <h1 className="text-title font-semibold text-slate-50">This link is not valid<Hint className="ml-1.5">It may have been cut short when it was copied. You can switch any email off yourself under Settings, Notification settings.</Hint></h1>
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
      <h1 className="text-title font-semibold text-slate-50">Stop these emails?</h1>
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

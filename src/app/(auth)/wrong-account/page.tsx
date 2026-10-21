import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { safeCallbackPath } from "@/lib/safeRedirect";
import { isProtectedPath } from "@/lib/csp";
import { Card } from "@/components/ui/Card";
import { WrongAccountActions } from "./WrongAccountActions";

export const metadata = { title: "Wrong account" };

/**
 * Where an emailed link lands when it was meant for a different account than the one signed in (the middleware sends
 * it here, see recipientTag.ts). It never shows the signed-in account's own screen as if it were the email's.
 */
export default async function WrongAccountPage(props: { searchParams: Promise<{ next?: string; for?: string }> }) {
  const { next, for: intendedFor } = await props.searchParams;
  const target = safeCallbackPath(next, "/dashboard");
  const session = await getServerAuthSession();
  // Nobody signed in: nothing to compare. A page that needs an account goes to sign-in (and the link is checked again after); one that
  // does not (such as the unsubscribe page) simply opens.
  if (!session?.user) redirect(isProtectedPath(target.split("?")[0]) ? `/login?callbackUrl=${encodeURIComponent(target)}` : target);

  const shown = (intendedFor ?? "").replace(/[^\w.*@+-]/g, "").slice(0, 80);

  return (
    <Card className="mx-auto max-w-md">
      <h1 className="text-body font-semibold text-slate-50">Sign in with the right account to open this page</h1>
      <p className="mt-2 text-small text-slate-300">
        This link was sent to <span className="font-medium text-slate-100">{shown || "another account"}</span>. You are signed in as{" "}
        <span className="font-medium text-slate-100">{session.user.email}</span>, so we did not open it. Sign in as the person it was
        meant for to see this page.
      </p>
      <WrongAccountActions next={target} currentEmail={session.user.email ?? "this account"} />
    </Card>
  );
}

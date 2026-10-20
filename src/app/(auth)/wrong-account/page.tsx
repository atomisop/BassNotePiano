import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { safeCallbackPath } from "@/lib/safeRedirect";
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
  // Nobody signed in: nothing to compare, so just sign in and the link is checked again.
  if (!session?.user) redirect(`/login?callbackUrl=${encodeURIComponent(target)}`);

  const shown = (intendedFor ?? "").replace(/[^\w.*@+-]/g, "").slice(0, 80);

  return (
    <Card className="mx-auto max-w-md">
      <h1 className="text-body font-semibold text-slate-50">This link is for a different account</h1>
      <p className="mt-2 text-small text-slate-300">
        The email was sent to <span className="font-medium text-slate-100">{shown || "another account"}</span>. You are signed in as{" "}
        <span className="font-medium text-slate-100">{session.user.email}</span>, so we did not open it.
      </p>
      <WrongAccountActions next={target} currentEmail={session.user.email ?? "this account"} />
    </Card>
  );
}

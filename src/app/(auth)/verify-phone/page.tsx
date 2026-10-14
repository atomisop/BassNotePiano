import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeCallbackPath } from "@/lib/safeRedirect";
import { VerifyPhoneForm } from "./VerifyPhoneForm";

export const metadata = { title: "Verify your phone" };

/**
 * The phone step of creating an account: confirm a number with a 6-digit text. Shown right after the email
 * code, and again at any later sign-in until it is done (the app layout sends unfinished accounts here).
 * Older accounts are never sent here; they are only asked, in a popup and in Settings.
 */
export default async function VerifyPhonePage(props: { searchParams: Promise<{ callbackUrl?: string; sent?: string }> }) {
 const searchParams = await props.searchParams;
 const session = await getServerAuthSession();
 if (!session?.user) redirect("/login?callbackUrl=/verify-phone");
 const callbackUrl = safeCallbackPath(searchParams.callbackUrl ?? "/dashboard");

 const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { phone: true, phoneVerifiedAt: true, pendingPhone: true } });
 if (!user || user.phoneVerifiedAt) redirect(callbackUrl);

 return <VerifyPhoneForm pendingPhone={user.pendingPhone} codeAlreadySent={searchParams.sent === "1"} callbackUrl={callbackUrl} />;
}

import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { phoneVerifyMode } from "@/lib/phoneVerification";
import { parseInstrumentIntent } from "@/lib/instrumentIntent";
import { safeCallbackPath } from "@/lib/safeRedirect";
import { hasFirstAndLastName } from "@/lib/studentName";
import { OnboardingWizard } from "./OnboardingWizard";

export const metadata = { title: "Welcome" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ instrument?: string | string[]; next?: string | string[] }> }) {
  const { instrument, next } = await searchParams;
  // Where they were going before the wizard (a plan chosen on Pricing, say), kept through every step. Only a plain in-app path.
  const nextPath = typeof next === "string" ? safeCallbackPath(next) : null;
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/onboarding");
  if (session.user.onboarded) redirect(nextPath ?? "/dashboard");

  // Confirming a phone number is part of creating an account, so it comes before the profile wizard.
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { phoneRequired: true, phoneVerifiedAt: true, name: true } });
  if (user?.phoneRequired && !user.phoneVerifiedAt && (await phoneVerifyMode())) {
    const back = nextPath ? `/onboarding?next=${encodeURIComponent(nextPath)}` : "/onboarding";
    redirect(`/verify-phone?callbackUrl=${encodeURIComponent(back)}`);
  }

  // Sign in with Google can give a single word for a name; payments are matched by the full name, so the first step asks for the rest.
  const askName = !hasFirstAndLastName(user?.name);
  return <OnboardingWizard initialInstrument={parseInstrumentIntent(instrument)} askFullName={askName} initialName={askName ? (user?.name ?? "") : ""} />;
}

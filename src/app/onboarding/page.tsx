import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { phoneVerifyMode } from "@/lib/phoneVerification";
import { OnboardingWizard } from "./OnboardingWizard";

export default async function OnboardingPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/onboarding");
  if (session.user.onboarded) redirect("/dashboard");

  // Confirming a phone number is part of creating an account, so it comes before the profile wizard.
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { phoneRequired: true, phoneVerifiedAt: true } });
  if (user?.phoneRequired && !user.phoneVerifiedAt && (await phoneVerifyMode())) redirect("/verify-phone?callbackUrl=/onboarding");

  return <OnboardingWizard />;
}

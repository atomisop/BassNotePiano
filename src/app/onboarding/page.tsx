import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { OnboardingWizard } from "./OnboardingWizard";

export const metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/onboarding");
  if (session.user.onboarded) redirect("/dashboard");

  return <OnboardingWizard />;
}

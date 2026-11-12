import { getBoolSetting, getNumberSetting } from "@/lib/siteSettings";
import { RegisterForm } from "./RegisterForm";

// Read on every visit (the owner can change the trial in Settings), so the line under the title never promises a trial that is off.
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  // The page must open even if the settings cannot be read: no trial line is better than no sign-up.
  const trialDays = await Promise.all([getBoolSetting("trial.enabled"), getNumberSetting("trial.days")])
    .then(([enabled, days]) => (enabled && days > 0 ? days : null))
    .catch(() => null);
  return <RegisterForm trialDays={trialDays} />;
}

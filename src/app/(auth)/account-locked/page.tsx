import { Card } from "@/components/ui/Card";
import { SmileyXEyes } from "@/components/ui/appIcons";
import { ContactSupportButton } from "./ContactSupportButton";

export const metadata = { title: "Account locked", robots: { index: false } };

/**
 * Where an account locked for non-payment lands when it tries to sign in (paymentLock.ts). Public, because a locked
 * account has no session; it names nobody and shows nothing about any account.
 */
export default function AccountLockedPage() {
  return (
    <Card className="mx-auto max-w-md text-center">
      <SmileyXEyes aria-hidden className="mx-auto h-24 w-24 text-red-400" />
      <h1 className="mt-4 text-title font-semibold text-slate-50">Your account is locked</h1>
      <p className="mt-2 text-body text-slate-300">
        Your account has been flagged for non-payment and all access to your BNP account is taken away. Please contact support to resolve this
        issue.
      </p>
      <div className="mt-6 flex flex-col items-center gap-3">
        <ContactSupportButton />
        <a href="mailto:music@bassnotepiano.com" className="tap inline-flex items-center text-small text-slate-400 underline">
          Or email music@bassnotepiano.com
        </a>
      </div>
    </Card>
  );
}

import { redirect } from "next/navigation";

// The old one-payment family bundle page. Families are set up on the payment plan page now ("Me and my family"): one plan
// per person at the family rate, started together, with one payer. This keeps old links working.
export default function BillingLessonsPage() {
  redirect("/billing/plans");
}

import { redirect } from "next/navigation";

// The curriculum used to be a one-time purchase at this URL. It now comes
// with live classes only, so old links (emails, bookmarks, notifications)
// land on the class plans instead of a dead page.
export default function BillingCurriculumPage() {
  redirect("/billing/plans");
}

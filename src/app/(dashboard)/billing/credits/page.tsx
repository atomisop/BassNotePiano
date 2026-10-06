import { redirect } from "next/navigation";

// Credits can no longer be bought on their own: extra classes are booked and paid for one at a time on /lessons.
export default function CreditsPage() {
  redirect("/lessons?tab=extra");
}

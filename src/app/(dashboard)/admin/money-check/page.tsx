import { redirect } from "next/navigation";

/** The money check is a tab of Payments now: this address opens it there. */
export default function Page() {
  redirect("/admin/payments?tab=check");
}

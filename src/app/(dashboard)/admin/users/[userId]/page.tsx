import { notFound } from "next/navigation";
import Link from "next/link";
import { getCustomerProfile } from "@/lib/adminCustomer";
import { CustomerProfile } from "@/components/admin/CustomerProfile";
import { setCurriculumAccessAction, toggleScaleUnlockAction, clearAssistantHistoryAction, setUserRoleAction } from "../actions";
import { adjustUserCreditsAction } from "../../payments/credit-actions";
import { adminCancelBookingAction } from "../../schedule/actions";
import { adminForceSignOutAction, forgetPayerNameAction } from "./actions";

export const metadata = { title: "Admin: Student" };

export default async function AdminCustomerPage({ params }: { params: { userId: string } }) {
  const profile = await getCustomerProfile(params.userId);
  if (!profile) notFound();

  return (
    <div>
      <Link href="/admin/users" className="tap inline-flex items-center text-small font-medium text-slate-500 transition hover:text-slate-300">
        ← All users
      </Link>
      <p className="mt-3 text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">{profile.user.name ?? profile.user.email}</h1>

      <div className="mt-8">
        <CustomerProfile
          profile={profile}
          onSetCurriculumAccess={setCurriculumAccessAction}
          onToggleScale={toggleScaleUnlockAction}
          onClearAssistantHistory={clearAssistantHistoryAction}
          onSetRole={setUserRoleAction}
          onAdjustCredits={adjustUserCreditsAction}
          onCancelBooking={adminCancelBookingAction}
          onForceSignOut={adminForceSignOutAction}
          onForgetPayerName={forgetPayerNameAction}
        />
      </div>
    </div>
  );
}

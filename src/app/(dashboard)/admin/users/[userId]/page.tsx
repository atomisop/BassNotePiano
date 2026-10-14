import { notFound } from "next/navigation";
import Link from "next/link";
import { getCustomerProfile } from "@/lib/adminCustomer";
import { CustomerProfile } from "@/components/admin/CustomerProfile";
import { setCurriculumAccessAction, toggleScaleUnlockAction, clearAssistantHistoryAction, setUserRoleAction } from "../actions";
import { adjustUserCreditsAction } from "../../payments/credit-actions";
import { adminCancelBookingAction } from "../../schedule/actions";
import { adminClearPhoneAction, adminForceSignOutAction, banUserAction, forgetPayerNameAction, unbanUserAction } from "./actions";
import { BackLink } from "@/components/ui/BackLink";

export const metadata = { title: "Admin: Student" };

export default async function AdminCustomerPage(props: { params: Promise<{ userId: string }> }) {
  const params = await props.params;
  const profile = await getCustomerProfile(params.userId);
  if (!profile) notFound();

  return (
    <div>
      <BackLink href="/admin/users" className="tap inline-flex items-center text-small font-medium text-slate-500 transition hover:text-slate-300">
        ← Back
      </BackLink>
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
          onClearPhone={adminClearPhoneAction}
          onBan={banUserAction}
          onUnban={unbanUserAction}
        />
      </div>
    </div>
  );
}

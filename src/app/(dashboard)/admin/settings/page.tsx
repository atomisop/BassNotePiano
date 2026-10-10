import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { getAllSettings } from "@/lib/siteSettings";
import { CLIENT_SETTING_DEFS, SETTING_CATEGORIES, SETTING_DEFS } from "@/lib/siteSettingsDefs";
import { SettingsPanel } from "@/components/admin/SettingsPanel";
import { saveSettingAction, resetSettingAction } from "./actions";

export const metadata = { title: "Admin: Settings" };

export default async function AdminSettingsPage() {
  const session = await getServerAuthSession();
  const isOwner = isOwnerEmail(session?.user.email);
  const values = await getAllSettings();

  if (!isOwner) {
    return (
      <div>
        <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Settings</h1>
        <p className="mt-2 text-small text-slate-500">Only the owner can change the app&apos;s settings.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Settings</h1>
      <p className="mt-2 text-small text-slate-500">
        {SETTING_DEFS.length} controls across {SETTING_CATEGORIES.length} areas. Switches save the moment you flip them. Every change is recorded in the audit log.
      </p>
      <div className="mt-6">
        <SettingsPanel
          defs={CLIENT_SETTING_DEFS}
          categories={SETTING_CATEGORIES.map((c) => ({ id: c.id, label: c.label, blurb: c.blurb }))}
          initial={Object.fromEntries(values)}
          onSave={saveSettingAction}
          onReset={resetSettingAction}
        />
      </div>
    </div>
  );
}

"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SlideOverPanel } from "@/components/layout/SlideOverPanel";
import { TermsContent, TERMS_LAST_UPDATED } from "@/components/legal/TermsContent";
import { PrivacyContent, PRIVACY_LAST_UPDATED } from "@/components/legal/PrivacyContent";
import { CHANGELOG, CURRENT_VERSION } from "@/lib/changelog";
import { CheckIcon } from "@/components/ui/icons";
import { WideLayout } from "@/components/layout/PageLayouts";
import { BackLink, PageBack } from "@/components/ui/BackLink";
import { ChevronRight, Clock, FileText, Info, ShieldCheck, type AppIcon } from "@/components/ui/appIcons";

const TAB_ICONS = {
  about: Info,
  updates: Clock,
  terms: FileText,
  privacy: ShieldCheck,
  chevron: ChevronRight,
} satisfies Record<string, AppIcon>;

const TABS = [
  { id: "about", label: "About", icon: TAB_ICONS.about },
  { id: "updates", label: "Update notes", icon: TAB_ICONS.updates },
  { id: "terms", label: "Terms & refunds", icon: TAB_ICONS.terms },
  { id: "privacy", label: "Privacy", icon: TAB_ICONS.privacy },
] as const;

type TabId = (typeof TABS)[number]["id"];

function TabIcon({ icon: Icon, className = "h-[18px] w-[18px] shrink-0" }: { icon: AppIcon; className?: string }) {
  return <Icon className={className} />;
}

function DesktopAboutNav({ activeTab, onSelect }: { activeTab: TabId; onSelect: (tab: TabId) => void }) {
  return (
    <nav className="sticky top-6 hidden w-56 shrink-0 flex-col gap-1 self-start glass-surface p-2 lg:flex">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onSelect(tab.id)}
          className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-small transition ${
            activeTab === tab.id
              ? "border-slate-50/40 bg-slate-800 text-slate-50"
              : "border-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
          }`}
        >
          <TabIcon icon={tab.icon} />
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

function MobileAboutMenu({ onSelect }: { onSelect: (tab: TabId) => void }) {
  return (
    <div className="glass-surface divide-y divide-ink/10 lg:hidden">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onSelect(tab.id)}
          className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-ink/5"
        >
          <TabIcon icon={tab.icon} className="h-5 w-5 shrink-0 text-slate-400" />
          <span className="flex-1 text-small text-slate-100">{tab.label}</span>
          <TabIcon icon={TAB_ICONS.chevron} className="h-4 w-4 shrink-0 text-slate-500" />
        </button>
      ))}
    </div>
  );
}

function AboutTab() {
  return (
    <div className="glass-surface p-6">
      <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Bass Note Piano</p>
      <p className="mt-1 text-body text-slate-50 font-semibold">Version {CURRENT_VERSION}</p>
      <p className="mt-3 max-w-md text-small text-slate-400">
        An interactive masterclass in the Ethiopian scale system: Tizita, Bati, Anchihoye, and Mixolydian
        pentatonics, spelled correctly in every key, with native chords mapped for each one.
      </p>
      <p className="mt-6 text-small text-slate-500">© {new Date().getFullYear()} Bass Note Piano.</p>
    </div>
  );
}

function UpdatesTab() {
  return (
    <div className="space-y-4">
      {CHANGELOG.map((entry) => (
        <div key={entry.version} className="glass-surface p-6">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">v{entry.version}</p>
            <p className="text-small text-slate-500">{entry.date}</p>
          </div>
          <h2 className="mt-1.5 text-title text-slate-50 font-semibold">{entry.title}</h2>
          <ul className="mt-3 space-y-1.5">
            {entry.items.map((item) => (
              <li key={item} className="flex gap-2.5 text-small text-slate-300">
                <CheckIcon className="mt-1 shrink-0 text-slate-50" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function TermsTab() {
  return (
    <div className="glass-surface space-y-6 p-6">
      <div>
        <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Legal</p>
        <p className="mt-1 text-body text-slate-50 font-semibold">Terms &amp; refund policy</p>
        <p className="mt-2 text-small text-slate-500">
          Last updated {TERMS_LAST_UPDATED}.
        </p>
      </div>
      <TermsContent />
    </div>
  );
}

function PrivacyTab() {
  return (
    <div className="glass-surface space-y-6 p-6">
      <div>
        <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Legal</p>
        <p className="mt-1 text-body text-slate-50 font-semibold">Privacy policy</p>
        <p className="mt-2 text-small text-slate-500">
          Last updated {PRIVACY_LAST_UPDATED}.
        </p>
      </div>
      <PrivacyContent />
    </div>
  );
}

function TabContent({ tab }: { tab: TabId }) {
  if (tab === "about") return <AboutTab />;
  if (tab === "updates") return <UpdatesTab />;
  if (tab === "terms") return <TermsTab />;
  return <PrivacyTab />;
}

function AboutClientInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const initialTab: TabId = TABS.some((t) => t.id === requestedTab) ? (requestedTab as TabId) : "about";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [mobileOpenTab, setMobileOpenTab] = useState<TabId | null>(null);

  useEffect(() => {
    if (!requestedTab || !TABS.some((t) => t.id === requestedTab)) return;
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setMobileOpenTab(requestedTab as TabId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectDesktopTab(tab: TabId) {
    setActiveTab(tab);
    router.replace(`/about?tab=${tab}`, { scroll: false });
  }

  function openMobileTab(tab: TabId) {
    setActiveTab(tab);
    setMobileOpenTab(tab);
    router.replace(`/about?tab=${tab}`, { scroll: false });
  }

  return (
    <WideLayout>
      {/* Only ever linked from Settings, see AccountSettings.tsx. */}
      <PageBack href="/account" />
      <div>
        <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Info</p>
        <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">About</h1>
      </div>

      <div className="mt-6 flex flex-col gap-8 lg:flex-row">
        <DesktopAboutNav activeTab={activeTab} onSelect={selectDesktopTab} />
        <MobileAboutMenu onSelect={openMobileTab} />
        <div className="hidden min-w-0 flex-1 lg:block">
          <TabContent tab={activeTab} />
        </div>
      </div>

      <SlideOverPanel
        open={mobileOpenTab !== null}
        onClose={() => setMobileOpenTab(null)}
        title={mobileOpenTab ? TABS.find((t) => t.id === mobileOpenTab)!.label : ""}
      >
        {mobileOpenTab && <TabContent tab={mobileOpenTab} />}
      </SlideOverPanel>
    </WideLayout>
  );
}

export function AboutClient() {
  return (
    <Suspense fallback={null}>
      <AboutClientInner />
    </Suspense>
  );
}

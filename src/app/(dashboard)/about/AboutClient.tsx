"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SlideOverPanel } from "@/components/layout/SlideOverPanel";
import { TermsContent, TERMS_LAST_UPDATED } from "@/components/legal/TermsContent";
import { CHANGELOG, CURRENT_VERSION } from "@/lib/changelog";

const TAB_ICONS = {
  about: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 7.5h.01",
  updates: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 3",
  terms: "M9 12h6M9 16h6M9 8h1M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z",
  chevron: "M9 18l6-6-6-6",
} as const;

const TABS = [
  { id: "about", label: "About", icon: TAB_ICONS.about },
  { id: "updates", label: "Update notes", icon: TAB_ICONS.updates },
  { id: "terms", label: "Terms & refunds", icon: TAB_ICONS.terms },
] as const;

type TabId = (typeof TABS)[number]["id"];

function TabIcon({ path, className = "h-[18px] w-[18px] shrink-0" }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d={path} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DesktopAboutNav({ activeTab, onSelect }: { activeTab: TabId; onSelect: (tab: TabId) => void }) {
  return (
    <nav className="sticky top-6 hidden w-56 shrink-0 flex-col gap-1 self-start glass-surface p-2 lg:flex">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onSelect(tab.id)}
          className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
            activeTab === tab.id
              ? "border-amber-400/40 bg-slate-800 text-slate-50"
              : "border-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
          }`}
        >
          <TabIcon path={tab.icon} />
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

function MobileAboutMenu({ onSelect }: { onSelect: (tab: TabId) => void }) {
  return (
    <div className="glass-surface divide-y divide-white/10 lg:hidden">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onSelect(tab.id)}
          className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-white/5"
        >
          <TabIcon path={tab.icon} className="h-5 w-5 shrink-0 text-slate-400" />
          <span className="flex-1 text-sm text-slate-100">{tab.label}</span>
          <TabIcon path={TAB_ICONS.chevron} className="h-4 w-4 shrink-0 text-slate-600" />
        </button>
      ))}
    </div>
  );
}

function AboutTab() {
  return (
    <div className="glass-surface p-6">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Bass Note Piano</p>
      <p className="mt-1 font-serif text-2xl text-slate-50">Version {CURRENT_VERSION}</p>
      <p className="mt-3 max-w-md text-sm text-slate-400">
        An interactive masterclass in the Ethiopian kiñit system — Tizita, Bati, Anchihoye, and Mixolydian
        pentatonics — spelled correctly in every key, with native chords mapped for each one.
      </p>
      <p className="mt-6 text-xs text-slate-600">© {new Date().getFullYear()} Bass Note Piano.</p>
    </div>
  );
}

function UpdatesTab() {
  return (
    <div className="space-y-4">
      {CHANGELOG.map((entry) => (
        <div key={entry.version} className="glass-surface p-6">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">v{entry.version}</p>
            <p className="text-xs text-slate-600">{entry.date}</p>
          </div>
          <h2 className="mt-1.5 font-serif text-lg text-slate-50">{entry.title}</h2>
          <ul className="mt-3 space-y-1.5">
            {entry.items.map((item) => (
              <li key={item} className="flex gap-2.5 text-sm text-slate-300">
                <span className="mt-0.5 shrink-0 text-amber-400">✓</span>
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
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Legal</p>
        <p className="mt-1 font-serif text-2xl text-slate-50">Terms &amp; refund policy</p>
        <p className="mt-2 text-sm text-slate-500">
          Last updated {TERMS_LAST_UPDATED}. Also shown before you create an account and before your first purchase —
          this page is just here so you can find it again later.
        </p>
      </div>
      <TermsContent />
    </div>
  );
}

function TabContent({ tab }: { tab: TabId }) {
  if (tab === "about") return <AboutTab />;
  if (tab === "updates") return <UpdatesTab />;
  return <TermsTab />;
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
    <div className="mx-auto max-w-4xl">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Info</p>
        <h1 className="mt-1.5 font-serif text-2xl text-slate-50">About</h1>
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
    </div>
  );
}

export function AboutClient() {
  return (
    <Suspense fallback={null}>
      <AboutClientInner />
    </Suspense>
  );
}

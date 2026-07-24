"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CHANGELOG, CURRENT_VERSION } from "@/lib/changelog";

const TAB_ICONS = {
  about: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 7.5h.01",
  updates: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 3",
} as const;

const TABS = [
  { id: "about", label: "About", icon: TAB_ICONS.about },
  { id: "updates", label: "Update notes", icon: TAB_ICONS.updates },
] as const;

type TabId = (typeof TABS)[number]["id"];

function TabIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px] shrink-0">
      <path d={path} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AboutTabs({ activeTab, onSelect }: { activeTab: TabId; onSelect: (tab: TabId) => void }) {
  return (
    <>
      <nav className="mb-2 flex gap-2 overflow-x-auto pb-1 lg:hidden">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              activeTab === tab.id
                ? "border-amber-400/50 bg-slate-900 text-amber-200"
                : "border-white/10 text-slate-400 hover:border-white/20"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <nav className="sticky top-6 hidden w-56 shrink-0 flex-col gap-1 self-start rounded-2xl border border-white/10 bg-slate-900/60 p-2 lg:flex">
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
    </>
  );
}

function AboutTab() {
  return (
    <div className="glass-card p-6">
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
        <div key={entry.version} className="glass-card p-6">
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

function AboutClientInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const initialTab: TabId = TABS.some((t) => t.id === requestedTab) ? (requestedTab as TabId) : "about";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  function selectTab(tab: TabId) {
    setActiveTab(tab);
    router.replace(`/about?tab=${tab}`, { scroll: false });
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Info</p>
        <h1 className="mt-1.5 font-serif text-2xl text-slate-50">About</h1>
      </div>

      <div className="mt-6 flex flex-col gap-8 lg:flex-row">
        <AboutTabs activeTab={activeTab} onSelect={selectTab} />
        <div className="min-w-0 flex-1">{activeTab === "about" ? <AboutTab /> : <UpdatesTab />}</div>
      </div>
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

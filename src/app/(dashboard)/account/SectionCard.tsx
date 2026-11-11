"use client";

import { createContext, useContext, type ReactNode } from "react";
import { Hint } from "@/components/ui/Hint";
import { ChevronRight } from "@/components/ui/appIcons";

/**
 * Inside a `SettingsGroup` every setting is a row of the group's one card, so it draws no surface of its own. Outside a group (the
 * Notifications, Membership and Tutorials sections) a setting is still its own quiet card.
 */
const InGroup = createContext(false);

/** The surface a settings group (or a lone setting) sits on: a quiet card, no outline (DESIGN.md, "Band, sheet and tiles" 6). */
export const SETTINGS_CARD = "rounded-card bg-neu-base shadow-raised-low";
/** The padding of one setting, whether it is a row of a group or a card by itself. */
export const SETTINGS_ROW = "p-5 md:p-6";

/**
 * One group of settings as one quiet card: each setting inside is a row, with a hairline between rows. A group whose settings all
 * render nothing (a card that is switched off) leaves no empty card behind.
 */
export function SettingsGroup({ children }: { children: ReactNode }) {
  return (
    <InGroup.Provider value={true}>
      <div className={`${SETTINGS_CARD} divide-y divide-slate-50/8 empty:hidden`}>{children}</div>
    </InGroup.Provider>
  );
}

/** For a setting that draws its own box (the phone number, two-step sign-in): the row's classes inside a group, the card's outside. */
export function useSettingsSurface(): string {
  return useContext(InGroup) ? SETTINGS_ROW : `${SETTINGS_CARD} ${SETTINGS_ROW}`;
}

/**
 * One setting. It leads with its title and, when there is one, the current value (Verified, On for this device, 3 devices), so
 * the list can be read without opening anything (DESIGN.md, Hierarchy 1 and 3). The value is a quiet line under the title.
 *
 * `advanced` settings start closed behind their title (a native disclosure, so
 * it works without JavaScript and is keyboard and screen reader friendly):
 * options most people never need stay out of the way until asked for.
 */
export function SectionCard({
  title,
  hint,
  value,
  advanced = false,
  children,
}: {
  title: string;
  hint?: string;
  /** The setting's current state, shown under the title (also on a closed card). */
  value?: ReactNode;
  advanced?: boolean;
  children: ReactNode;
}) {
  const inGroup = useContext(InGroup);
  const surface = inGroup ? SETTINGS_ROW : `${SETTINGS_CARD} ${SETTINGS_ROW}`;
  if (advanced) {
    return (
      <details className={`group ${surface} [&_summary::-webkit-details-marker]:hidden`}>
        <summary className="tap flex cursor-pointer list-none items-center justify-between gap-3 rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="min-w-0">
            <span className="block text-body font-semibold text-slate-50">{title}</span>
            {value && <span className="mt-0.5 block text-small text-slate-400">{value}</span>}
          </span>
          <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-slate-500 transition group-open:rotate-90" />
        </summary>
        {hint && <p className="mt-2 text-small text-slate-500">{hint}</p>}
        <div className="mt-4">{children}</div>
      </details>
    );
  }
  return (
    <div className={surface}>
      {/* In a group the title is one row's name among several, so it is body size; a card by itself keeps the title size. */}
      <h2 className={`flex items-center gap-1 font-semibold text-slate-50 ${inGroup ? "text-body" : "text-title"}`}>
        {title}
        {hint && <Hint>{hint}</Hint>}
      </h2>
      {value && <p className="mt-0.5 text-small text-slate-400">{value}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

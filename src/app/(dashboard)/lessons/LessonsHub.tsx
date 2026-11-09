"use client";

import { useState, type ReactNode } from "react";
import { Tabs } from "@/components/ui/Tabs";

type HubTab = "weekly" | "extra";

/**
 * What a student on a payment plan sees at /lessons: their locked-in weekly
 * class on one tab, and extra sessions (booked with credits bought at $40 each)
 * on the other. Same sliding tabs as the rest of the app. A group plan member
 * with no weekly time of their own books every class themselves, so for them
 * the tabs read "My classes" and "Book a class".
 */
export function LessonsHub({
  weekly,
  extras,
  initialTab = "weekly",
  weeklyLabel = "My weekly class",
  extraLabel = "Extra sessions",
}: {
  weekly: ReactNode;
  extras: ReactNode;
  initialTab?: HubTab;
  weeklyLabel?: string;
  extraLabel?: string;
}) {
  const [tab, setTab] = useState<HubTab>(initialTab);
  return (
    <div>
      <div className="mx-auto mb-6 w-full max-w-wide">
        <Tabs<HubTab>
          label="Your classes"
          value={tab}
          onChange={setTab}
          items={[
            { id: "weekly", label: weeklyLabel },
            { id: "extra", label: extraLabel },
          ]}
        />
      </div>
      {/* Both stay mounted so a half-picked day or typed email survives a tab switch. */}
      <div hidden={tab !== "weekly"} className="tab-in">{weekly}</div>
      <div hidden={tab !== "extra"} className="tab-in">{extras}</div>
    </div>
  );
}

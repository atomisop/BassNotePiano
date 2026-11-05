"use client";

import { useState, type ReactNode } from "react";
import { Tabs } from "@/components/ui/Tabs";

type HubTab = "weekly" | "extra";

/**
 * What a student on a payment plan sees at /lessons: their locked-in weekly
 * class on one tab, and extra sessions (booked with credits bought at $40 each)
 * on the other. Same sliding tabs as the rest of the app.
 */
export function LessonsHub({
  weekly,
  extras,
  initialTab = "weekly",
}: {
  weekly: ReactNode;
  extras: ReactNode;
  initialTab?: HubTab;
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
            { id: "weekly", label: "My weekly class" },
            { id: "extra", label: "Extra sessions" },
          ]}
        />
      </div>
      {/* Both stay mounted so a half-picked day or typed email survives a tab switch. */}
      <div hidden={tab !== "weekly"} className="tab-in">{weekly}</div>
      <div hidden={tab !== "extra"} className="tab-in">{extras}</div>
    </div>
  );
}

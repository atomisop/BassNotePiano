import type { Metadata } from "next";
import { AtomHandoff } from "@/components/stageshow/scenes/AtomHandoff";
import { BookingHero } from "@/components/stageshow/scenes/BookingHero";
import { ParentPair } from "@/components/stageshow/scenes/ParentPair";
import { PhoneReminders } from "@/components/stageshow/scenes/PhoneReminders";
import { PracticeStreak } from "@/components/stageshow/scenes/PracticeStreak";
import { PricingBento } from "@/components/stageshow/scenes/PricingBento";
import { ScaleUnlock } from "@/components/stageshow/scenes/ScaleUnlock";

// A private review page for the Stageshow scenes (illustrated product demos). Not linked from anywhere and not indexed.
export const metadata: Metadata = { title: "Stageshow preview", robots: { index: false, follow: false } };

export default function Page() {
  return (
    <main style={{ background: "#241c18", minHeight: "100vh", padding: "32px 16px", display: "grid", gap: 48, justifyItems: "center" }}>
      <section id="booking" style={{ width: "min(760px, 100%)" }}>
        <BookingHero />
      </section>
      <section id="pricing" style={{ width: "min(880px, 100%)" }}>
        <PricingBento />
      </section>
      <section id="scale" style={{ width: "min(760px, 100%)" }}>
        <ScaleUnlock />
      </section>
      <section id="atom" style={{ width: "min(760px, 100%)" }}>
        <AtomHandoff />
      </section>
      <section id="parent" style={{ width: "min(760px, 100%)" }}>
        <ParentPair />
      </section>
      <section id="streak" style={{ width: "min(760px, 100%)" }}>
        <PracticeStreak />
      </section>
      <section id="reminders" style={{ width: "min(760px, 100%)" }}>
        <PhoneReminders />
      </section>
    </main>
  );
}

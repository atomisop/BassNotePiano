"use client";

import { AtomHandoff } from "@/components/stageshow/scenes/AtomHandoff";
import { BookingHero } from "@/components/stageshow/scenes/BookingHero";
import { ParentPair } from "@/components/stageshow/scenes/ParentPair";
import { PhoneReminders } from "@/components/stageshow/scenes/PhoneReminders";
import { PracticeStreak } from "@/components/stageshow/scenes/PracticeStreak";
import { ScaleUnlock } from "@/components/stageshow/scenes/ScaleUnlock";

// Small illustrated demos (Stageshow scenes) of how the app works. Pure pictures: nothing here reads or writes real data.
const SCENES = [
  { id: "booking", title: "Book a class in one tap", Scene: BookingHero },
  { id: "scale", title: "Your teacher opens the next scale", Scene: ScaleUnlock },
  { id: "streak", title: "Ten minutes a day builds a streak", Scene: PracticeStreak },
  { id: "reminders", title: "Reminders on your phone", Scene: PhoneReminders },
  { id: "parent", title: "Parents can manage a child's classes", Scene: ParentPair },
  { id: "atom", title: "A real person is one tap away", Scene: AtomHandoff },
] as const;

export function SeeItWork() {
  return (
    <section aria-labelledby="see-it-work" className="relative mx-auto max-w-5xl px-6 py-20 md:py-28">
      <h2 id="see-it-work" className="text-center font-serif text-headline text-slate-50">
        See it work
      </h2>
      <div className="mt-10 grid gap-10 md:grid-cols-2">
        {SCENES.map(({ id, title, Scene }) => (
          <figure key={id} className="m-0">
            <Scene />
            <figcaption className="mt-3 text-center text-small text-slate-300">{title}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

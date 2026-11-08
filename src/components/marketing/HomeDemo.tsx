"use client";

import { BookingHero } from "@/components/stageshow/scenes/BookingHero";

// One illustrated demo (a Stageshow scene) between the product tour and the four steps. Pure picture: nothing here reads or writes real data.
export function HomeDemo() {
  return (
    <section aria-labelledby="home-demo" className="relative mx-auto max-w-3xl px-6 py-20 md:py-28">
      <h2 id="home-demo" className="text-center font-serif text-headline text-slate-50">
        Book a class in one tap
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-center text-body text-slate-50/80">
        Pick a time and it is booked, with a notice on your phone.
      </p>
      <div className="mt-10">
        <BookingHero />
      </div>
    </section>
  );
}

"use client";

import { useRef } from "react";
import { motion, useScroll, useReducedMotion } from "framer-motion";
import { SCALE_GROUPS } from "@/lib/curriculum";
import { spellScale } from "@/lib/music-theory";
import { CARD_SURFACE } from "@/lib/surface";
import { ClipText } from "@/components/ui/text-scroll-read";

/**
 * The four kiñits, as cards that arrive from alternating screen edges.
 *
 * This replaces the pinned keyboard stage. The pinning existed to hold a
 * *centre canvas* still while copy moved past it; with the keyboard gone
 * there is nothing left to pin, and 440vh of sticky scroll containing only
 * text would be a long stretch of nearly-empty screen. The fixed scroll video
 * already provides the locked backdrop that pinning used to supply, so the
 * cards can simply travel over it — which is the Breakthrough Energy pattern
 * in its original form: still image, moving text.
 *
 * Cards alternate sides and enter from the edge they settle on, so the motion
 * reads as each one arriving at its own position rather than sliding across
 * the composition.
 *
 * Expo-out easing, cubic-bezier(0.16, 1, 0.3, 1): most of the distance is
 * covered in the first third, so a card feels like it was already moving and
 * is settling, not starting from rest.
 */

const EXPO_OUT = [0.16, 1, 0.3, 1] as const;

const SCENE_SLUGS = ["scale-1", "scale-2", "scale-4", "scale-5"] as const;

const SCENE_COPY: Record<string, { root: string; body: string }> = {
  "scale-1": {
    root: "C",
    body: "The one everybody already knows by ear. Tizita is the sound of Ethiopian memory — five notes, no half steps, nothing to trip over. It is where the system opens.",
  },
  "scale-2": {
    root: "A",
    body: "Drop the third and the seventh and the same five fingers turn mournful. Bati is Tizita's shadow: identical geometry, opposite feeling, one relative step away.",
  },
  "scale-4": {
    root: "E",
    body: "A flat second against a flat fifth — the interval Western theory spent centuries avoiding. Anchihoye builds its entire character on it, and it resolves nowhere else.",
  },
  "scale-5": {
    root: "G",
    body: "The bridge back. Mixolydian pentatonic keeps the major brightness but lowers the seventh, which is why it sits so naturally under horns and modern Ethio-jazz.",
  },
};

interface Kinit {
  slug: string;
  code: string;
  kinit: string;
  formula: string;
  root: string;
  body: string;
}

const KINITS: Kinit[] = SCENE_SLUGS.map((slug) => {
  const group = SCALE_GROUPS.find((g) => g.slug === slug);
  if (!group) throw new Error(`KinitCards: unknown scale slug "${slug}"`);
  return {
    slug,
    code: group.code,
    kinit: group.kinitName ?? group.title,
    formula: group.formula,
    ...SCENE_COPY[slug],
  };
});

export function KinitCards() {
  return (
    <section className="relative mx-auto max-w-6xl px-6 py-24 sm:py-32" aria-label="The four kiñits">
      <div className="mb-16 flex justify-center">
        <div className={`${CARD_SURFACE} max-w-lg px-8 py-7 text-center`}>
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-amber-300">
            The four kiñits
          </span>
          <h2 className="mt-3 text-balance font-serif text-3xl leading-[1.05] text-slate-50 sm:text-4xl">
            Five notes, four moods
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            Each kiñit is a different way of choosing five notes out of twelve. Same instrument,
            entirely different emotional weather.
          </p>
        </div>
      </div>

      <div className="space-y-10 sm:space-y-14">
        {KINITS.map((kinit, i) => (
          <KinitCard key={kinit.slug} kinit={kinit} index={i} />
        ))}
      </div>
    </section>
  );
}

function KinitCard({ kinit, index }: { kinit: Kinit; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const fromLeft = index % 2 === 0;

  // Drives the reading illumination on the body copy. Tied to this card's own
  // travel through the viewport, so the sweep finishes while the card is fully
  // on screen rather than being cut off by its own exit.
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 88%", "center 42%"],
  });

  return (
    <div className={`flex ${fromLeft ? "justify-start" : "justify-end"}`}>
      <motion.article
        ref={ref}
        initial={
          reduced
            ? { opacity: 0 }
            : { opacity: 0, x: fromLeft ? -90 : 90, filter: "blur(8px)" }
        }
        whileInView={
          reduced ? { opacity: 1 } : { opacity: 1, x: 0, filter: "blur(0px)" }
        }
        viewport={{ once: true, margin: "-12% 0px" }}
        transition={reduced ? { duration: 0.3 } : { duration: 0.9, ease: EXPO_OUT }}
        className={`${CARD_SURFACE} w-full max-w-xl p-7 sm:p-9`}
      >
        <div className="flex items-center gap-2.5">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-amber-300">
            {String(index + 1).padStart(2, "0")} · {kinit.code}
          </span>
        </div>

        <h3 className="mt-4 text-balance font-serif text-3xl leading-[1.04] text-slate-50 sm:text-4xl">
          {kinit.kinit}
        </h3>

        <p className="mt-2.5 font-mono text-sm text-slate-400">
          {kinit.root} · {kinit.formula.split("-").join(" – ")}
        </p>

        <p className="mt-5 text-[15px] leading-relaxed sm:text-base">
          <ClipText progress={scrollYProgress}>{kinit.body}</ClipText>
        </p>

        <NoteRow root={kinit.root} formula={kinit.formula} />
      </motion.article>
    </div>
  );
}

/**
 * The scale spelled out. Still driven by the app's own `spellScale()` engine,
 * so these are the same correctly-spelled degrees the lesson pages teach —
 * that connection was the point of the keyboard and it survives without it.
 */
function NoteRow({ root, formula }: { root: string; formula: string }) {
  const spelled = spellScale(root, formula);

  return (
    <div className="mt-7 flex flex-wrap gap-2">
      {spelled.notes.map((note, i) => (
        <motion.span
          key={`${note}-${i}`}
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10% 0px" }}
          transition={{ delay: 0.25 + i * 0.06, duration: 0.5, ease: EXPO_OUT }}
          className="chip-accent flex items-baseline gap-1.5 rounded-lg px-3 py-1.5"
        >
          <span className="font-mono text-sm text-amber-100">{note}</span>
          <span className="font-mono text-[10px] text-amber-300/60">{spelled.degrees[i]}</span>
        </motion.span>
      ))}
    </div>
  );
}

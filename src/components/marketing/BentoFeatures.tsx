"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useRef, useState } from "react";
import { ROOT_KEYS, spellScale } from "@/lib/music-theory";
import { SCALE_GROUPS } from "@/lib/curriculum";
import { CARD_SURFACE, CARD_SURFACE_INTERACTIVE } from "@/lib/surface";

/**
 * Asymmetric bento grid.
 *
 * The cells are deliberately unequal — a 4-column anchor next to stacked
 * 2-column cells — because a uniform 3×2 of identical boxes is the single
 * most recognisable "template" tell. Unequal cells force a reading order,
 * which is the actual job of this section: the transposition engine is the
 * thing worth understanding first, so it gets four columns and a live
 * visual; everything else is a supporting fact at two columns.
 *
 * Every cell carries a pointer-tracked spotlight. It's not decoration — with
 * hairline borders this low-contrast, the spotlight is what confirms a cell
 * is a discrete object under the cursor rather than a region of a flat field.
 */

function BentoCell({
  className = "",
  children,
  href,
}: {
  className?: string;
  children: React.ReactNode;
  href?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState({ x: 50, y: 50, on: false });

  const handleMove = (event: React.PointerEvent) => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setSpot({
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
      on: true,
    });
  };

  const body = (
    <motion.div
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={() => setSpot((s) => ({ ...s, on: false }))}
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className={[
        "group relative isolate overflow-hidden p-7",
        // Shared with the kiñit cards and section intros — see CARD_SURFACE for
        // why the fill value is measured rather than chosen.
        CARD_SURFACE_INTERACTIVE,
        className,
      ].join(" ")}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 transition-opacity duration-300"
        style={{
          opacity: spot.on ? 1 : 0,
          background: `radial-gradient(340px circle at ${spot.x}% ${spot.y}%, rgb(var(--c-a-400) / 0.09), transparent 68%)`,
        }}
      />
      {children}
    </motion.div>
  );

  return href ? (
    <Link href={href} className={className ? "contents" : undefined}>
      {body}
    </Link>
  ) : (
    body
  );
}

function CellLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-amber-300">
      {children}
    </span>
  );
}

function CellTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-3 text-balance font-serif text-2xl leading-[1.1] text-slate-50">
      {children}
    </h3>
  );
}

function CellBody({ children }: { children: React.ReactNode }) {
  return <p className="mt-2.5 text-sm leading-relaxed text-slate-300">{children}</p>;
}

export function BentoFeatures() {
  // A live slice of the transposition engine — Tizita spelled from six of the
  // twelve curriculum roots. Real output, not a mock: same call the lesson
  // pages make.
  const tizita = SCALE_GROUPS.find((g) => g.slug === "scale-1");
  // Eight of the twelve roots, not six. This cell spans two grid rows, and at
  // six rows its content ran ~100px shorter than the two stacked cells beside
  // it — leaving a band of dead space inside a bordered card, which reads as a
  // mistake rather than as breathing room. Eight fills the span and makes the
  // "all 12 keys" claim harder to doubt.
  const sample = ROOT_KEYS.slice(0, 8).map((root) => ({
    root,
    notes: tizita ? spellScale(root, tizita.formula).notes : [],
  }));
  const remainingRoots = ROOT_KEYS.length - sample.length;

  return (
    <section className="relative mx-auto max-w-6xl px-6 py-28 sm:py-36">
      <motion.div
        initial={{ opacity: 0, x: -70, filter: "blur(8px)" }}
        whileInView={{ opacity: 1, x: 0, filter: "blur(0px)" }}
        viewport={{ once: true, margin: "-12% 0px" }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className={`${CARD_SURFACE} max-w-xl px-8 py-7`}
      >
        <CellLabel>The system</CellLabel>
        <h2 className="mt-3 text-balance font-serif text-3xl leading-[1.03] text-slate-50 sm:text-4xl">
          Not a song library. A spelling engine.
        </h2>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-300">
          Most Ethiopian music resources hand you tabs for individual songs. This teaches the
          underlying grammar — so you can play anything in the tradition, in any key, correctly.
        </p>
      </motion.div>

      <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-6">
        {/* ---- Anchor cell: the transposition engine, running ---- */}
        <BentoCell className="md:col-span-4 md:row-span-2">
          <CellLabel>All 12 keys</CellLabel>
          <CellTitle>Every scale, spelled correctly in every key</CellTitle>
          <CellBody>
            A b3 is always written flat, a #4 always sharp — never the enharmonic twin. The engine
            applies the book&rsquo;s own spelling rule, so what you read is what a session player
            would write.
          </CellBody>

          <div className="mt-7 space-y-2">
            {sample.map(({ root, notes }, rowIndex) => (
              <motion.div
                key={root}
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ delay: rowIndex * 0.05, type: "spring", stiffness: 220, damping: 26 }}
                className="flex items-center gap-3"
              >
                <span className="w-8 shrink-0 font-mono text-xs text-slate-500">{root}</span>
                <div className="flex flex-wrap gap-1.5">
                  {notes.map((note, i) => (
                    <span
                      key={i}
                      className="chip-neutral rounded-md px-2 py-1 font-mono text-xs text-slate-200"
                    >
                      {note}
                    </span>
                  ))}
                </div>
              </motion.div>
            ))}
            <p className="pt-2 font-mono text-[11px] text-slate-500">
              + {remainingRoots} more roots · {SCALE_GROUPS.length} scale groups
            </p>
          </div>
        </BentoCell>

        {/* ---- Gated progression ---- */}
        <BentoCell className="md:col-span-2">
          <CellLabel>Sequenced</CellLabel>
          <CellTitle>Pass 80% to unlock the next</CellTitle>
          <CellBody>
            Chapters open in order. You cannot skip ahead on a scale you haven&rsquo;t actually
            absorbed — or unlock everything at once if you&rsquo;d rather set your own pace.
          </CellBody>
          <div className="mt-6 flex items-center gap-1.5">
            {SCALE_GROUPS.map((group, i) => (
              <div
                key={group.slug}
                className={`h-1 flex-1 rounded-full ${i < 2 ? "bg-amber-400" : "bg-slate-50/10"}`}
              />
            ))}
          </div>
        </BentoCell>

        {/* ---- Live classes ---- */}
        <BentoCell className="md:col-span-2" href="/pricing">
          <CellLabel>Live on Zoom</CellLabel>
          <CellTitle>Weekly group classes</CellTitle>
          <CellBody>
            Buy credits, book a seat, show up. Bundle discounts reach 30% and credits never expire.
          </CellBody>
          <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-amber-300">
            See pricing
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
              className="transition-transform duration-300 group-hover:translate-x-1"
            >
              <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </BentoCell>

        {/* ---- Guitar ---- */}
        <BentoCell className="md:col-span-3">
          <CellLabel>Guitar</CellLabel>
          <CellTitle>Kiñit is a language, not a piano trick</CellTitle>
          <CellBody>
            The same Tizita and Bati pentatonics you learn at the keys map directly onto six
            strings — the intervals don&rsquo;t care what instrument is producing them.
          </CellBody>
        </BentoCell>

        {/* ---- Streaks / badges ---- */}
        <BentoCell className="md:col-span-3">
          <CellLabel>Progress</CellLabel>
          <CellTitle>Streaks, badges, and a roadmap that remembers</CellTitle>
          <CellBody>
            Practice is tracked per scale, so the roadmap always shows exactly where you stopped and
            what opens next.
          </CellBody>
        </BentoCell>
      </div>
    </section>
  );
}

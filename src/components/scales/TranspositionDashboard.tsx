"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { ROOT_KEYS, spellScale, getScaleInAllKeys, type RootKey } from "@/lib/music-theory";
import type { ScaleVariant } from "@/lib/scale-content";

export interface TranspositionDashboardProps {
  variant: ScaleVariant;
  root: RootKey;
}

/** Spells `variant` at `root`, plus a reference table of all 12 keys with the active root highlighted. */
export function TranspositionDashboard({ variant, root }: TranspositionDashboardProps) {
  const spelled = useMemo(() => spellScale(root, variant.formula), [root, variant.formula]);
  const allKeys = useMemo(() => getScaleInAllKeys(variant.formula), [variant.formula]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Transposition Dashboard</p>
      <h2 className="mt-1 font-serif text-xl text-slate-50">{variant.name}</h2>
      <p className="mt-2 font-mono text-xs text-slate-500">{variant.formula.split("-").join(" – ")}</p>

      <motion.div
        key={root + variant.name}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        className="mt-6 flex flex-wrap gap-3"
      >
        {spelled.notes.map((note, i) => (
          <div
            key={`${note}-${i}`}
            className="flex w-16 flex-col items-center rounded-xl border border-amber-400/25 bg-amber-400/5 py-3"
          >
            <span className="font-serif text-lg text-slate-50">{note}</span>
            <span className="mt-1 text-[11px] text-amber-300/80">{spelled.degrees[i]}</span>
          </div>
        ))}
      </motion.div>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-[11px] tracking-wide text-slate-500">
              <th className="pb-2 pr-4 font-medium uppercase">Key</th>
              {/* Degree tokens (b3, #4, ...) are case-sensitive — no uppercase transform here. */}
              {spelled.degrees.map((d, i) => (
                <th key={`${d}-${i}`} className="pb-2 pr-4 font-medium">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROOT_KEYS.map((key) => (
              <tr key={key} className={`border-t border-slate-900 ${key === root ? "bg-amber-400/5" : ""}`}>
                <td className={`py-2 pr-4 font-medium ${key === root ? "text-amber-300" : "text-slate-300"}`}>
                  {key}
                </td>
                {allKeys[key].map((note, i) => (
                  <td key={i} className="py-2 pr-4 text-slate-400">
                    {note}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

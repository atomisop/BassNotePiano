"use client";

import { useEffect, useState } from "react";
import { Slider, Switch } from "glisse";
import "glisse/styles.css";

/**
 * How liquid the glass is: one switch (on or flat) and one strength slider, kept on this device. They set glisse's own variables on
 * <html>, so the dock and every button follow: frost (`--lg-blur`), colour pull (`--lg-filter`) and how bright the lens and rim shine
 * (`--lg-lens-shine`, `--lg-rim-shine`). `LiquidGlassApply` (mounted once in providers) puts the saved choice on every page.
 */
const KEY = "bnp-liquid-glass";
const DEFAULTS = { on: true, level: 85 };

type Setting = { on: boolean; level: number };

function read(): Setting {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Setting> | null;
    if (raw && typeof raw.on === "boolean" && typeof raw.level === "number") return { on: raw.on, level: Math.min(100, Math.max(0, raw.level)) };
  } catch {}
  return DEFAULTS;
}

function apply({ on, level }: Setting) {
  const root = document.documentElement;
  const style = root.style;
  const names = ["--lg-blur", "--lg-filter", "--bnp-liquid-blur", "--lg-rim-shine", "--lg-glass", "--lg-glass-active", "--bnp-dock-glass"];
  if (!on) {
    for (const p of names) style.removeProperty(p);
    return;
  }
  // Extreme at the top: heavy frost, strong colour pull, a bright light rim and glass so clear the page shows bending through it.
  const t = level / 100;
  const dark = root.getAttribute("data-mode") !== "light";
  const rgb = dark ? "40 40 40" : "255 255 255";
  const alpha = 0.62 - t * 0.5;
  style.setProperty("--lg-blur", `${(2 + t * 34).toFixed(1)}px`);
  style.setProperty("--bnp-liquid-blur", `${(8 + t * 32).toFixed(1)}px`);
  style.setProperty("--lg-filter", `saturate(${(1.2 + t * 2.4).toFixed(2)}) brightness(${(1 + t * 0.25).toFixed(2)}) contrast(${(1 + t * 0.15).toFixed(2)})`);
  style.setProperty("--lg-rim-shine", `${(0.1 + t * 1.1).toFixed(2)}`);
  style.setProperty("--lg-glass", `rgb(${rgb} / ${alpha.toFixed(2)})`);
  style.setProperty("--lg-glass-active", `rgb(${rgb} / ${(alpha + 0.18).toFixed(2)})`);
  style.setProperty("--bnp-dock-glass", `rgb(${dark ? "30 30 32" : "255 255 255"} / ${(0.86 - t * 0.6).toFixed(2)})`);
}

export function LiquidGlassApply() {
  useEffect(() => apply(read()), []);
  return null;
}

export function LiquidGlassControl() {
  const [s, setS] = useState<Setting>(DEFAULTS);
  useEffect(() => setS(read()), []);
  const save = (next: Setting) => {
    setS(next);
    apply(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <span className="text-body text-slate-100">Liquid glass</span>
        <Switch aria-label="Liquid glass" checked={s.on} onCheckedChange={(on) => save({ ...s, on })} />
      </div>
      <div className={`flex items-center gap-3 ${s.on ? "" : "pointer-events-none opacity-40"}`}>
        <span className="text-small text-slate-400">Flat</span>
        <Slider aria-label="How liquid the glass is" value={s.level} min={0} max={100} step={1} onValueChange={(level) => save({ ...s, level })} />
        <span className="text-small text-slate-400">Liquid</span>
      </div>
    </div>
  );
}

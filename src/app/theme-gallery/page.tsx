"use client";

// A daisyUI theme gallery — installed at the user's request to bring in all
// of daisyUI's built-in themes.
//
// Deliberately NOT wired into the rest of the site. Two reasons:
//
//   1. Bass Note Piano's own theme system (Paper/Ink/Glass, see
//      src/lib/themes.ts) already keys off `data-theme` on <html>. daisyUI
//      does too. Only one of them can own that attribute at a time — setting
//      it to a daisyUI theme name anywhere the real app renders would blank
//      out every `--c-*` custom property the actual product depends on.
//   2. None of the site's ~113 existing components use daisyUI's class
//      names (`btn`, `card`, `alert`, ...) — they're all hand-styled with
//      this project's own `slate`/`amber`/`ink`/`surface` tokens. Switching
//      a daisyUI theme on top of them would visibly change nothing, which
//      defeats the point of a page whose only job is showing what each
//      theme actually looks like.
//
// So `data-theme` is set on a wrapper <div> here, not <html>, and every
// component on the page is genuine daisyUI markup (buttons, cards, alerts,
// form controls, stats, tabs) — the only place in the app that consumes the
// daisyUI classes this plugin generates. Not linked from any nav; reachable
// only by URL.

import { useState } from "react";
import Link from "next/link";

const THEMES = [
  "light", "dark", "cupcake", "bumblebee", "emerald", "corporate", "synthwave",
  "retro", "cyberpunk", "valentine", "halloween", "garden", "forest", "aqua",
  "lofi", "pastel", "fantasy", "wireframe", "black", "luxury", "dracula",
  "cmyk", "autumn", "business", "acid", "lemonade", "night", "coffee",
  "winter", "dim", "nord", "sunset",
] as const;

export default function ThemeGalleryPage() {
  const [theme, setTheme] = useState<(typeof THEMES)[number]>("dracula");

  return (
    <div data-theme={theme} className="min-h-screen bg-base-100 text-base-content">
      <div className="navbar bg-base-200 shadow-sm">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-2">
          <div>
            <p className="text-lg font-bold">daisyUI theme gallery</p>
            <p className="text-xs opacity-60">Not part of the main site — reachable only by this URL.</p>
          </div>
          <Link href="/" className="btn btn-ghost btn-sm">
            ← Back to Bass Note Piano
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* Every one of the 32 built-in themes, one click to preview. */}
        <div className="mb-8 flex flex-wrap gap-2">
          {THEMES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTheme(t)}
              className={`btn btn-sm ${theme === t ? "btn-primary" : "btn-outline"}`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Buttons */}
          <div className="card bg-base-200 shadow">
            <div className="card-body">
              <h2 className="card-title">Buttons</h2>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-primary">Primary</button>
                <button className="btn btn-secondary">Secondary</button>
                <button className="btn btn-accent">Accent</button>
                <button className="btn btn-neutral">Neutral</button>
                <button className="btn btn-ghost">Ghost</button>
                <button className="btn btn-outline">Outline</button>
              </div>
            </div>
          </div>

          {/* Alerts */}
          <div className="card bg-base-200 shadow">
            <div className="card-body gap-3">
              <h2 className="card-title">Alerts</h2>
              <div className="alert alert-info py-2 text-sm">Info — just letting you know.</div>
              <div className="alert alert-success py-2 text-sm">Success — that worked.</div>
              <div className="alert alert-warning py-2 text-sm">Warning — check this.</div>
              <div className="alert alert-error py-2 text-sm">Error — that failed.</div>
            </div>
          </div>

          {/* Form controls */}
          <div className="card bg-base-200 shadow">
            <div className="card-body gap-3">
              <h2 className="card-title">Form controls</h2>
              <input type="text" placeholder="Text input" className="input input-bordered w-full" />
              <select className="select select-bordered w-full" defaultValue="">
                <option value="" disabled>
                  Select an option
                </option>
                <option>Piano</option>
                <option>Guitar</option>
              </select>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2">
                  <input type="checkbox" defaultChecked className="checkbox checkbox-primary" />
                  Checkbox
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="gallery-radio" defaultChecked className="radio radio-primary" />
                  Radio
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" defaultChecked className="toggle toggle-primary" />
                  Toggle
                </label>
              </div>
              <input type="range" defaultValue="60" className="range range-primary" />
            </div>
          </div>

          {/* Stats + progress + badges */}
          <div className="card bg-base-200 shadow">
            <div className="card-body gap-4">
              <h2 className="card-title">Stats &amp; badges</h2>
              <div className="stats stats-vertical shadow sm:stats-horizontal">
                <div className="stat">
                  <div className="stat-title">Students</div>
                  <div className="stat-value">1,204</div>
                  <div className="stat-desc">↗︎ 12% this month</div>
                </div>
                <div className="stat">
                  <div className="stat-title">Scales completed</div>
                  <div className="stat-value">3,842</div>
                </div>
              </div>
              <progress className="progress progress-primary w-full" value="70" max="100" />
              <div className="flex flex-wrap gap-2">
                <span className="badge badge-primary">Primary</span>
                <span className="badge badge-secondary">Secondary</span>
                <span className="badge badge-accent">Accent</span>
                <span className="badge badge-outline">Outline</span>
              </div>
            </div>
          </div>

          {/* Tabs + a full card example */}
          <div className="card bg-base-200 shadow lg:col-span-2">
            <div className="card-body">
              <h2 className="card-title">Tabs</h2>
              <div role="tablist" className="tabs tabs-boxed w-fit">
                <a role="tab" className="tab tab-active">
                  Overview
                </a>
                <a role="tab" className="tab">
                  Curriculum
                </a>
                <a role="tab" className="tab">
                  Pricing
                </a>
              </div>

              <div className="card mt-4 bg-base-100 shadow-inner md:card-side">
                <div className="card-body">
                  <h3 className="card-title">Example card</h3>
                  <p className="text-sm opacity-80">
                    A stock daisyUI card, rendered with whatever theme is selected above — this is the "{theme}"
                    theme's own palette, spacing, and radius, unrelated to Bass Note Piano's own design system.
                  </p>
                  <div className="card-actions justify-end">
                    <button className="btn btn-primary btn-sm">Action</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

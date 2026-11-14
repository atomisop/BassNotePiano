"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { StaggerList } from "@/components/ui/StaggerList";
import { IconSwap } from "@/components/ui/IconSwap";
import { SuccessPulse } from "@/components/ui/SuccessPulse";
import { MaskReveal } from "@/components/ui/MaskReveal";
import { SharedLayout, SharedLayoutGroup } from "@/components/ui/SharedLayout";
import { useArc } from "@/lib/useArc";
import { rubberBand } from "@/lib/useRubberBand";

function Block({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="lgx-card rounded-card p-4 md:p-5">
      <p className="text-caption uppercase tracking-caps text-slate-400">Rule {n}</p>
      <h2 className="mb-3 text-title text-slate-50">{title}</h2>
      {children}
    </section>
  );
}

export function MotionPreview() {
  const [on, setOn] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [reveal, setReveal] = useState(false);
  const [tab, setTab] = useState(0);
  const [rows, setRows] = useState(0);
  const [side, setSide] = useState(false);
  const [drag, setDrag] = useState(0);
  const fly = useArc();

  return (
    <TooltipProvider>
      <main className="mx-auto grid max-w-3xl gap-3 bg-ground p-4 text-slate-50 md:gap-4 md:p-8">
        <h1 className="text-hero">Motion pieces</h1>
        <Block n="4" title="Button press 0.97">
          <div className="flex flex-wrap gap-2">
            <Button>Main action</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
          </div>
        </Block>
        <Block n="5, 13" title="Switch: knob stretches 12% while held, no bounce">
          <div className="flex items-center gap-3">
            <Switch checked={on} onCheckedChange={setOn} aria-label="Demo switch" />
            <span className="text-small text-slate-300">{on ? "On" : "Off"}</span>
          </div>
        </Block>
        <Block n="10, 11, 12" title="Tooltip / popover: 0.95 start, from the trigger, exits 20% faster">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline">Hover or focus me</Button>
            </TooltipTrigger>
            <TooltipContent>Grows out of the button</TooltipContent>
          </Tooltip>
        </Block>
        <Block n="3" title="Stagger list, 30 ms a row">
          <Button size="sm" variant="secondary" onClick={() => setRows((r) => r + 1)}>Replay</Button>
          <StaggerList key={rows} className="mt-3 grid gap-2">
            {["Scale 1", "Scale 2", "Scale 3", "Scale 4", "Scale 5"].map((t) => (
              <div key={t} className="lgx-row rounded-control px-4 py-3 text-small">{t}</div>
            ))}
          </StaggerList>
        </Block>
        <Block n="18" title="Icon swap: crossfade with scale and blur">
          <Button variant="outline" onClick={() => setCopied((c) => !c)}>
            <IconSwap state={copied}>{copied ? <span aria-hidden>✓</span> : <span aria-hidden>⧉</span>}</IconSwap>
            {copied ? "Copied" : "Copy"}
          </Button>
        </Block>
        <Block n="8" title="Success pulse">
          <SuccessPulse pulseKey={pulse} className="inline-block">
            <Button onClick={() => setPulse((p) => p + 1)}>Mark saved</Button>
          </SuccessPulse>
        </Block>
        <Block n="17" title="Mask reveal (clip-path wipe)">
          <Button size="sm" variant="secondary" onClick={() => setReveal((r) => !r)}>{reveal ? "Hide" : "Reveal"}</Button>
          <MaskReveal show={reveal} className="mt-3 rounded-control bg-signal px-4 py-3 text-small text-signal-ink">Wiped in from the top</MaskReveal>
        </Block>
        <Block n="20" title="Same layoutId: the tab indicator travels">
          <SharedLayoutGroup>
            <div className="lgx-row flex gap-1 rounded-full p-1">
              {["Overview", "Money", "Classes"].map((t, i) => (
                <button key={t} onClick={() => setTab(i)} className="relative rounded-full px-4 py-2 text-small">
                  {tab === i && <SharedLayout id="tab-pill" className="absolute inset-0 rounded-full bg-signal" />}
                  <span className={`relative ${tab === i ? "text-signal-ink" : "text-slate-300"}`}>{t}</span>
                </button>
              ))}
            </div>
          </SharedLayoutGroup>
        </Block>
        <Block n="7, 9" title="Arc: a chip flies to the other side on a curve">
          <div className="flex justify-between">
            <button
              className="lgx-btn rounded-full px-4 py-2 text-small"
              style={{ order: side ? 2 : 0 }}
              onClick={(e) => {
                const el = e.currentTarget;
                const from = el.getBoundingClientRect();
                setSide((s) => !s);
                requestAnimationFrame(() => fly(el, from, el.getBoundingClientRect()));
              }}
            >
              Class
            </button>
          </div>
        </Block>
        <Block n="14, 19" title="Rubber band: drag the bar past its limit, no tween while held">
          <div
            className="lgx-row touch-none select-none rounded-control px-4 py-3 text-small"
            style={{ transform: `translateX(${drag}px)`, transition: drag === 0 ? "transform 240ms var(--ease-ios)" : "none" }}
            onPointerDown={(e) => {
              const startX = e.clientX;
              const el = e.currentTarget;
              el.setPointerCapture(e.pointerId);
              const move = (ev: PointerEvent) => setDrag(rubberBand(ev.clientX - startX, 0, 0, 200));
              const up = () => {
                setDrag(0);
                el.removeEventListener("pointermove", move);
                el.removeEventListener("pointerup", up);
              };
              el.addEventListener("pointermove", move);
              el.addEventListener("pointerup", up);
            }}
          >
            Drag me sideways
          </div>
        </Block>
      </main>
    </TooltipProvider>
  );
}

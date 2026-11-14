"use client";

import { useEffect, useState } from "react";
import { Download, EllipsisVertical, Share, SquarePlus, Smartphone } from "@/components/ui/appIcons";
import { HOME_SCREEN_STEPS, detectPlatform, type HomeScreenPlatform } from "@/lib/addToHome";
import { buttonVariants } from "@/components/ui/button";

const ICONS = { share: Share, plus: SquarePlus, menu: EllipsisVertical, open: Smartphone } as const;

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
declare global {
  interface Window {
    __bnpInstallPrompt?: InstallEvent | null;
  }
}

/** True when the site is already running from the Home Screen. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

/** The numbered steps, with an iPhone and an Android tab (the device's own one first). Chrome on Android also gets a one-tap Install button when the browser allows it. */
export function AddToHomeSteps({ onInstalled }: { onInstalled?: () => void }) {
  const [platform, setPlatform] = useState<Exclude<HomeScreenPlatform, "other">>("ios");
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const detected = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
    if (detected !== "other") setPlatform(detected);
    setCanInstall(Boolean(window.__bnpInstallPrompt));
    const onReady = () => setCanInstall(Boolean(window.__bnpInstallPrompt));
    window.addEventListener("bnp:install-ready", onReady);
    return () => window.removeEventListener("bnp:install-ready", onReady);
  }, []);

  async function install() {
    const event = window.__bnpInstallPrompt;
    if (!event) return;
    await event.prompt();
    const choice = await event.userChoice.catch(() => null);
    window.__bnpInstallPrompt = null;
    setCanInstall(false);
    if (choice?.outcome === "accepted") onInstalled?.();
  }

  const steps = HOME_SCREEN_STEPS[platform];
  return (
    <div>
      <div role="tablist" aria-label="Your phone" className="lgx-row inline-flex rounded-full p-1">
        {(["ios", "android"] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={platform === p}
            onClick={() => setPlatform(p)}
            className={`tap rounded-full px-4 py-1.5 text-small font-medium transition ${platform === p ? "lgx-btn text-slate-50" : "text-slate-400 hover:text-slate-200"}`}
          >
            {p === "ios" ? "iPhone / iPad" : "Android"}
          </button>
        ))}
      </div>

      {platform === "android" && canInstall && (
        <button type="button" onClick={install} className={buttonVariants({ variant: "primary", size: "sm", className: "mt-4" })}>
          <Download className="mr-2 h-4 w-4" aria-hidden /> Install now
        </button>
      )}

      <ol className="mt-4 space-y-3">
        {steps.map((step, i) => {
          const Icon = ICONS[step.icon];
          return (
            <li key={step.title} className="flex gap-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neu-base text-small font-semibold text-slate-200 shadow-raised-low" aria-hidden>
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-small font-medium text-slate-50">
                  {step.title}
                  <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                </p>
                <p className="text-small text-slate-400">{step.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

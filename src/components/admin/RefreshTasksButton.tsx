"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

/** Re-reads the page from the server so the Automatic tasks list shows the latest runs. */
export function RefreshTasksButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => router.refresh())}
      disabled={pending}
      aria-busy={pending}
      className="tap inline-flex min-h-9 items-center gap-2 rounded-lg bg-neu-base px-3 text-small font-medium text-slate-200 shadow-raised-low transition hover:text-slate-50 active:shadow-pressed-low disabled:opacity-70"
    >
      <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} aria-hidden />
      {pending ? "Checking…" : "Refresh"}
    </button>
  );
}

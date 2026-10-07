"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { markAllMailReadAction } from "./actions";
import { MorphingSquare } from "@/components/ui/morphing-square";

export function MarkAllReadButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await markAllMailReadAction();
          router.refresh();
        })
      }
      className="tap inline-flex items-center justify-center rounded-xl bg-neu-base px-4 py-2.5 text-small font-semibold text-slate-100 shadow-raised-low transition hover:shadow-raised-mid active:shadow-pressed-low disabled:opacity-50"
    >
      {pending && <MorphingSquare size={14} className="mr-1.5 shrink-0" />}
      Mark all read
    </button>
  );
}

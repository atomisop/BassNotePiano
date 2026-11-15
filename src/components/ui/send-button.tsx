"use client";

// From 21st.dev (serafimcloud/send-button). Only the colors are mapped to this
// app's tokens, and it now renders inside a real <button> at the call site.
import * as React from "react";
import { ArrowUp, Square } from "@/components/ui/appIcons";
import { cn } from "@/lib/utils";

export type SendButtonProps = {
  state: "idle" | "typing" | "streaming";
};

export function SendButton({ state }: SendButtonProps) {
  const isStreaming = state === "streaming";
  const isTyping = state === "typing";

  if (isStreaming) {
    return (
      <div className="flex size-9 items-center justify-center rounded-full bg-slate-100 shadow-raised-low">
        <Square className="size-4 fill-current text-slate-950" aria-hidden />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex size-9 items-center justify-center rounded-full transition-colors",
        isTyping ? "bg-signal shadow-raised-low" : "bg-neu-base shadow-pressed-low",
      )}
    >
      <ArrowUp className={cn("size-5", isTyping ? "text-slate-950" : "text-slate-500")} aria-hidden />
    </div>
  );
}

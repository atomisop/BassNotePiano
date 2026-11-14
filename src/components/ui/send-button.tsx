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
      <div className="lgx-btn flex size-9 items-center justify-center rounded-full">
        <Square className="size-4 fill-current text-slate-50" aria-hidden />
      </div>
    );
  }

  return (
    <div
      data-glass-tone={isTyping ? "primary" : undefined}
      className="lgx-btn flex size-9 items-center justify-center rounded-full transition-colors"
    >
      <ArrowUp className={cn("size-5", isTyping ? "text-slate-50" : "text-slate-500")} aria-hidden />
    </div>
  );
}

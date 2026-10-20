"use client";

// From 21st.dev (serafimcloud/send-button). Only the colors are mapped to this
// app's tokens, and it now renders inside a real <button> at the call site.
import * as React from "react";
import { IconArrowUp, IconPlayerStopFilled } from "@tabler/icons-react";
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
        <IconPlayerStopFilled className="size-5 text-slate-950" />
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
      <IconArrowUp className={cn("size-5", isTyping ? "text-slate-950" : "text-slate-500")} />
    </div>
  );
}

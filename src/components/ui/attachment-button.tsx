"use client";

// From 21st.dev (serafimcloud/attachment-button). Colors mapped to this app's
// tokens, plus an optional `label` and `expanded` so it can serve as the "more
// emoji" trigger.
import * as React from "react";
import { memo, type ReactNode } from "react";
import { Paperclip, Plus } from "@/components/ui/appIcons";
import { cn } from "@/lib/utils";

export type AttachmentButtonIcon = "plus" | "paperclip";

export type AttachmentButtonProps = {
  onClick?: () => void;
  icon?: AttachmentButtonIcon | ReactNode;
  label?: string;
  expanded?: boolean;
};

function isIconName(value: unknown): value is AttachmentButtonIcon {
  return value === "plus" || value === "paperclip";
}

export const AttachmentButton = memo(function AttachmentButton({
  onClick,
  icon = "plus",
  label = "Attach",
  expanded,
}: AttachmentButtonProps) {
  const iconClassName = "size-4 text-slate-300";
  let iconNode: ReactNode;
  if (isIconName(icon)) {
    iconNode =
      icon === "paperclip" ? (
        <Paperclip className={iconClassName} strokeWidth={2} />
      ) : (
        <Plus className={iconClassName} strokeWidth={2} />
      );
  } else {
    iconNode = icon;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={expanded}
      className={cn(
        "tap flex size-9 cursor-pointer items-center justify-center rounded-full bg-neu-base transition",
        expanded ? "shadow-pressed-low" : "shadow-raised-low",
      )}
    >
      {iconNode}
    </button>
  );
});

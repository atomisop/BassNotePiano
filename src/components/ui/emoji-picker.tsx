"use client";

// From 21st.dev (liveblocks/emoji-picker, built on frimousse). Colors mapped to
// this app's tokens; search input kept at 16px so iOS doesn't zoom on focus.
import {
  type EmojiPickerListCategoryHeaderProps,
  type EmojiPickerListEmojiProps,
  type EmojiPickerListRowProps,
  EmojiPicker as EmojiPickerPrimitive,
} from "frimousse";
import { LoaderIcon, SearchIcon } from "@/components/ui/appIcons";
import type * as React from "react";

import { cn } from "@/lib/utils";

function EmojiPicker({ className, ...props }: React.ComponentProps<typeof EmojiPickerPrimitive.Root>) {
  return (
    <EmojiPickerPrimitive.Root
      className={cn("isolate flex h-full w-full flex-col overflow-hidden rounded-2xl bg-neu-base text-slate-100", className)}
      data-slot="emoji-picker"
      {...props}
    />
  );
}

function EmojiPickerSearch({ className, ...props }: React.ComponentProps<typeof EmojiPickerPrimitive.Search>) {
  return (
    <div className={cn("flex h-11 items-center gap-2 border-b border-ink/10 px-3", className)} data-slot="emoji-picker-search-wrapper">
      <SearchIcon className="size-4 shrink-0 opacity-50" />
      <EmojiPickerPrimitive.Search
        className="flex h-10 w-full rounded-md bg-transparent py-3 text-body outline-hidden placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
        data-slot="emoji-picker-search"
        {...props}
      />
    </div>
  );
}

function EmojiPickerRow({ children, ...props }: EmojiPickerListRowProps) {
  return (
    <div {...props} className="scroll-my-1 px-1" data-slot="emoji-picker-row">
      {children}
    </div>
  );
}

function EmojiPickerEmoji({ emoji, className, ...props }: EmojiPickerListEmojiProps) {
  return (
    <button
      {...props}
      className={cn("flex size-9 items-center justify-center rounded-full text-title data-[active]:bg-neu-base data-[active]:shadow-pressed-low", className)}
      data-slot="emoji-picker-emoji"
    >
      {emoji.emoji}
    </button>
  );
}

function EmojiPickerCategoryHeader({ category, ...props }: EmojiPickerListCategoryHeaderProps) {
  return (
    <div {...props} className="bg-neu-base px-3 pb-2 pt-3.5 text-small leading-none text-slate-500" data-slot="emoji-picker-category-header">
      {category.label}
    </div>
  );
}

function EmojiPickerContent({ className, ...props }: React.ComponentProps<typeof EmojiPickerPrimitive.Viewport>) {
  return (
    <EmojiPickerPrimitive.Viewport className={cn("relative flex-1 outline-hidden", className)} data-slot="emoji-picker-viewport" {...props}>
      <EmojiPickerPrimitive.Loading className="absolute inset-0 flex items-center justify-center text-slate-500" data-slot="emoji-picker-loading">
        <LoaderIcon className="size-4 animate-spin" />
      </EmojiPickerPrimitive.Loading>
      <EmojiPickerPrimitive.Empty className="absolute inset-0 flex items-center justify-center text-small text-slate-500" data-slot="emoji-picker-empty">
        No emoji found.
      </EmojiPickerPrimitive.Empty>
      <EmojiPickerPrimitive.List
        className="select-none pb-1"
        components={{ Row: EmojiPickerRow, Emoji: EmojiPickerEmoji, CategoryHeader: EmojiPickerCategoryHeader }}
        data-slot="emoji-picker-list"
      />
    </EmojiPickerPrimitive.Viewport>
  );
}

export { EmojiPicker, EmojiPickerSearch, EmojiPickerContent };

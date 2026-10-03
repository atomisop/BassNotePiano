"use client";

import type { CSSProperties, ReactNode } from "react";

// From the 21st.dev "Message Bubble" (framecn/message-bubble): same variants,
// reaction badge, and hidden/visible rise-in state. Adapted in two ways only:
// the original's `useFramecnTheme` hook (a file the registry did not ship) is
// replaced by a small theme object mapped to this app's own color variables,
// and the font is inherited at the app's 16px body size instead of a hard-coded
// 14px Geist.

export type MessageBubbleState = "hidden" | "visible";

export type MessageBubbleVariant = "incoming" | "outgoing";

export interface BubbleTheme {
  primary: string;
  primaryForeground: string;
  muted: string;
  foreground: string;
  card: string;
}

const APP_THEME: BubbleTheme = {
  primary: "rgb(var(--signal))",
  primaryForeground: "rgb(var(--signal-ink))",
  muted: "rgb(var(--neu-base))",
  foreground: "rgb(var(--c-s-50))",
  card: "rgb(var(--neu-base))",
};

export interface MessageBubbleProps {
  state?: MessageBubbleState;
  style?: MessageBubbleStyle;
  variant?: MessageBubbleVariant;
  children?: ReactNode;
  reaction?: string;
  reactionStyle?: MessageBubbleReactionStyle;
  maxWidth?: number | string;
  theme?: Partial<BubbleTheme>;
  className?: string;
  /** Extra styles for the bubble body itself (e.g. padding for an inline dismiss control). */
  bodyStyle?: CSSProperties;
}

export interface MessageBubbleStyle {
  opacity: number;
  translateY: number;
  scale: number;
}

export interface MessageBubbleReactionStyle {
  opacity: number;
  scale: number;
}

export interface MessageBubbleStyleContext {
  background: string;
  color: string;
  align: "flex-start" | "flex-end";
  reactionSide: "left" | "right";
  reactionBackground: string;
  reactionColor: string;
  reactionRing: string;
}

export const messageBubbleStyleContext = (variant: MessageBubbleVariant, theme: BubbleTheme): MessageBubbleStyleContext => {
  const reaction = {
    reactionBackground: theme.muted,
    reactionColor: theme.foreground,
    reactionRing: theme.card,
  };
  if (variant === "outgoing") {
    return {
      align: "flex-end",
      background: theme.primary,
      color: theme.primaryForeground,
      reactionSide: "right",
      ...reaction,
    };
  }
  return {
    align: "flex-start",
    background: theme.muted,
    color: theme.foreground,
    reactionSide: "left",
    ...reaction,
  };
};

export const messageBubbleStyle = (state: MessageBubbleState): MessageBubbleStyle => {
  switch (state) {
    case "visible": {
      return { opacity: 1, scale: 1, translateY: 0 };
    }
    default: {
      return { opacity: 0, scale: 0.94, translateY: 12 };
    }
  }
};

export const messageBubbleReactionStyle = (state: MessageBubbleState): MessageBubbleReactionStyle =>
  state === "visible" ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 };

export const MessageBubble = ({
  state = "hidden",
  style,
  variant = "incoming",
  children,
  reaction,
  reactionStyle,
  maxWidth = "80%",
  theme: themeOverride,
  className,
  bodyStyle,
}: MessageBubbleProps) => {
  const theme = { ...APP_THEME, ...themeOverride };
  const ctx = messageBubbleStyleContext(variant, theme);
  const v = style ?? messageBubbleStyle(state);
  const reaction_ = reactionStyle ?? messageBubbleReactionStyle(state);
  return (
    <div
      className={className}
      style={{
        display: "flex",
        justifyContent: ctx.align,
        opacity: v.opacity,
        transform: `translateY(${v.translateY}px) scale(${v.scale})`,
        transformOrigin: ctx.align === "flex-end" ? "bottom right" : "bottom left",
        width: "100%",
      }}
    >
      <div style={{ maxWidth, minWidth: 0, position: "relative" }}>
        <div
          style={{
            background: ctx.background,
            border: "1px solid transparent",
            borderRadius: 24,
            color: ctx.color,
            display: "inline-block",
            fontFamily: "inherit",
            fontSize: 16,
            lineHeight: 1.5,
            maxWidth: "100%",
            overflowWrap: "break-word",
            padding: "10px 14px",
            wordBreak: "break-word",
            ...bodyStyle,
          }}
        >
          {children}
        </div>
        {reaction !== undefined && (
          <div
            style={{
              alignItems: "center",
              background: ctx.reactionBackground,
              borderRadius: 999,
              bottom: 0,
              boxShadow: `0 0 0 3px ${ctx.reactionRing}`,
              color: ctx.reactionColor,
              display: "flex",
              fontSize: 14,
              gap: 4,
              justifyContent: "center",
              left: ctx.reactionSide === "left" ? 12 : undefined,
              lineHeight: 1,
              minWidth: 24,
              opacity: reaction_.opacity,
              padding: "2px 6px",
              position: "absolute",
              right: ctx.reactionSide === "right" ? 12 : undefined,
              transform: `translateY(75%) scale(${reaction_.scale})`,
              transformOrigin: "center",
            }}
          >
            {reaction}
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;

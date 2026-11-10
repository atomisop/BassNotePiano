import type { NextApproval } from "@/lib/entitlementRules";

// What to tell a student who opens a scale that is not open to them yet. Pure,
// so it is tested; the page only supplies the facts.

export interface LockedScaleFacts {
  lockedBecause: "no-plan" | "not-yet-approved";
  /** The state of the student's next release (computeNextApproval). */
  next: NextApproval;
  /** The scale being opened. */
  slug: string;
  /** Title of the scale before the one being opened, when the checklist is what is missing. */
  previousTitle: string | null;
}

export interface LockedScaleMessage {
  heading: string;
  lines: string[];
  /** The one thing the student can do about it. */
  primary: { label: string; href: string } | null;
  /** A quieter second way forward, when there is one. */
  secondary?: { label: string; href: string };
  /** Show the "ask my teacher" button. */
  canAsk: boolean;
}

export function describeLockedScale(f: LockedScaleFacts, locale = "en-US"): LockedScaleMessage {
  if (f.lockedBecause === "no-plan") {
    return {
      heading: "Start a plan to open your scales",
      lines: [
        "Every plan includes live classes with your teacher and all of the lessons. Pick a plan and your first scale opens right away.",
      ],
      primary: { label: "Choose a plan", href: "/billing/plans" },
      secondary: { label: "Try a free class first", href: "/classes" },
      canAsk: false,
    };
  }

  const base = "Your teacher releases each scale once you have finished the one before it, and never more than one a week.";
  if (f.next.state === "ALL_UNLOCKED" || f.next.nextSlug !== f.slug) {
    return {
      heading: "This scale comes later",
      lines: [base, "Finish the scales before this one and it will open in its turn."],
      primary: { label: "Back to my scales", href: "/roadmap" },
      canAsk: false,
    };
  }
  if (f.next.state === "NEEDS_CHECKLIST") {
    return {
      heading: "This is your next scale",
      lines: [
        base,
        `${f.previousTitle ?? "The previous scale"} still has lessons, practice or the quiz to finish. Once it is all ticked off, this one is ready for your teacher to release.`,
      ],
      primary: { label: `Go to ${f.previousTitle ?? "the previous scale"}`, href: `/scales/${f.next.previousSlug}` },
      canAsk: false,
    };
  }
  if (f.next.state === "WAITING_PACE") {
    const date = new Date(f.next.availableAt).toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" });
    return {
      heading: `Earliest release: ${date}`,
      lines: [base, "You have finished what comes before it. The one-a-week pacing is the only thing left to wait for."],
      primary: { label: "Back to my scales", href: "/roadmap" },
      canAsk: false,
    };
  }
  return {
    heading: "Ready for your teacher to release",
    lines: [base, "You have finished what comes before this scale. It opens as soon as your teacher releases it. You can ask them to do it now."],
    primary: { label: "Back to my scales", href: "/roadmap" },
    canAsk: true,
  };
}

export interface GettingStartedInput {
  kind: "ADMIN" | "PAID" | "COMPED" | "TRIAL" | "NONE";
  /** How many children this person manages in parent mode. A parent who only pays for children is not a new student. */
  children?: number;
}

export interface GettingStartedStep {
  action: string;
  detail: string;
  href: string;
  cta: string;
  secondary?: { href: string; cta: string };
}

/**
 * What a student with no access should do next. Null for anyone who already has access. Every new account starts on the free
 * trial, so NONE means it ended (or trials are off): the way on is a plan, or a word with an instructor through the class form.
 */
export function gettingStartedStep(input: GettingStartedInput): GettingStartedStep | null {
  if (input.kind !== "NONE") return null;
  if ((input.children ?? 0) > 0) {
    return {
      action: input.children === 1 ? "Your child's classes" : "Your children's classes",
      detail: "See their next class and practice, move a class, or pay for their plan. Want lessons for yourself too? Pick a plan any time.",
      href: "/parent",
      cta: "Open Parent mode",
      secondary: { href: "/billing/plans", cta: "Lessons for me" },
    };
  }
  return {
    action: "Choose a class plan",
    detail: "Your lessons open as soon as your first payment is approved. Want to talk first? Send your details and an instructor will reach out.",
    href: "/billing/plans",
    cta: "See class plans",
    secondary: { href: "/classes", cta: "Talk to an instructor" },
  };
}

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
  /** Show the "ask my teacher" button. */
  canAsk: boolean;
}

export function describeLockedScale(f: LockedScaleFacts, locale = "en-US"): LockedScaleMessage {
  if (f.lockedBecause === "no-plan") {
    return {
      heading: "Scales come with live classes",
      lines: [
        "The curriculum opens one scale at a time as you and your teacher move through it. Start a class plan to begin, or apply for a free trial class to try the first lessons.",
      ],
      primary: { label: "See class plans", href: "/billing/plans" },
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
  /** The student has applied for a class and nobody has answered yet. */
  applicationPending: boolean;
  /** Length of the free trial in days, from Settings. 0 or missing means the copy does not mention a trial by length (default 3). */
  trialDays?: number;
}

export interface GettingStartedStep {
  action: string;
  detail: string;
  href: string;
  cta: string;
  secondary?: { href: string; cta: string };
}

/** What a student with no access yet should do next. Null for anyone who already has access. */
export function gettingStartedStep(input: GettingStartedInput): GettingStartedStep | null {
  if (input.kind !== "NONE") return null;
  const trialDays = input.trialDays ?? 3;
  if (input.applicationPending) {
    return {
      action: "Your class application is being reviewed",
      detail: "We will email you as soon as it is approved, and your first lessons open right away. In the meantime you can look at class plans.",
      href: "/billing/plans",
      cta: "See class plans",
      secondary: { href: "/practice", cta: "Try finger exercises" },
    };
  }
  return {
    action: "Two ways to start",
    detail: trialDays > 0
      ? `Apply for a free trial class and get the first lessons for ${trialDays} days, or choose a class plan and start right away.`
      : "Apply for classes, or choose a class plan and start right away.",
    href: "/classes",
    cta: trialDays > 0 ? "Apply for a free trial class" : "Apply for classes",
    secondary: { href: "/billing/plans", cta: "See class plans" },
  };
}

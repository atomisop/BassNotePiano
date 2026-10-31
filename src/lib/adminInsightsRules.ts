// "What could get better": fixed checks over the studio's own numbers, each written as a plain finding with the figures behind it
// and one thing to try. Pure, so it is tested without a database (tests/adminInsightsRules.test.ts); the counts come from
// getInsightInputs in adminData.ts. Nothing here is sent anywhere: the same numbers always give the same findings.

/** Fewer people than this and a rate says nothing, so the check stays quiet. */
export const MIN_SAMPLE = 3;
/** A scale someone has had open this long without finishing counts as stalled. */
export const STALL_DAYS = 21;

export interface ScaleInsightInput {
  code: string;
  title: string;
  href: string;
  /** People who have this scale open, finished or not. */
  unlocked: number;
  completed: number;
  /** Open for STALL_DAYS or more and not finished. */
  stalled: number;
  /** People who have taken this scale's quiz at least once, and how many passed on their first try. */
  quizTakers: number;
  quizFirstTryPassed: number;
}

export interface LessonInsightInput {
  scaleCode: string;
  title: string;
  /** People with the scale open, and how many finished this lesson. */
  reach: number;
  done: number;
  /** The same figures for the scale's lesson finished most often, to compare against. */
  bestDone: number;
}

export interface InsightInputs {
  scales: ScaleInsightInput[];
  lessons: LessonInsightInput[];
  practice: { learners: number; practicedThisWeek: number; practicedLastWeek: number };
  classes: { held: number; present: number; noShow: number; unmarked: number; canceledByStudent: number };
  atom: { up: number; down: number; handoffs: number };
  trials: { started: number; startedPlan: number };
  plans: { active: number; overdue: number };
}

export type InsightTone = "fix" | "watch" | "good";

export interface Insight {
  id: string;
  tone: InsightTone;
  /** The finding in one line. */
  title: string;
  /** The numbers behind it. */
  evidence: string;
  /** One concrete thing to try. */
  tryThis: string;
  href?: string;
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

export function buildInsights(input: InsightInputs): Insight[] {
  const out: Insight[] = [];

  // Where people stall: the scale with the most people stuck on it, if it holds a real share of the people who opened it.
  const stalls = input.scales
    .filter((s) => s.unlocked >= MIN_SAMPLE && s.stalled > 0)
    .map((s) => ({ s, rate: s.stalled / s.unlocked }))
    .sort((a, b) => b.rate - a.rate || b.s.stalled - a.s.stalled);
  const worstStall = stalls[0];
  if (worstStall && worstStall.rate >= 0.4) {
    const { s } = worstStall;
    out.push({
      id: `stall:${s.code}`,
      tone: worstStall.rate >= 0.6 ? "fix" : "watch",
      title: `${s.code} is where students get stuck`,
      evidence: `${people(s.stalled)} of ${s.unlocked} (${pct(s.stalled, s.unlocked)}%) have had ${s.title} open for ${STALL_DAYS}+ days without finishing.`,
      tryThis: "Look at which checklist step they stop on (module, practice or quiz) on the Scales tab, and cover that step in the next class.",
      href: s.href,
    });
  }

  // A hard quiz: few people pass it on the first try.
  const hardQuiz = input.scales
    .filter((s) => s.quizTakers >= MIN_SAMPLE)
    .map((s) => ({ s, rate: s.quizFirstTryPassed / s.quizTakers }))
    .sort((a, b) => a.rate - b.rate)[0];
  if (hardQuiz && hardQuiz.rate < 0.5) {
    const { s } = hardQuiz;
    out.push({
      id: `quiz:${s.code}`,
      tone: hardQuiz.rate < 0.3 ? "fix" : "watch",
      title: `The ${s.code} quiz is hard to pass the first time`,
      evidence: `${s.quizFirstTryPassed} of ${s.quizTakers} (${pct(s.quizFirstTryPassed, s.quizTakers)}%) passed on their first try.`,
      tryThis: "Add a short spelling drill to that scale's lessons, or walk through two practice questions in class before students take it.",
      href: s.href,
    });
  }

  // A lesson people skip: finished far less often than the best lesson in the same scale.
  const skipped = input.lessons
    .filter((l) => l.reach >= MIN_SAMPLE && l.bestDone >= MIN_SAMPLE)
    .map((l) => ({ l, gap: (l.bestDone - l.done) / l.reach }))
    .sort((a, b) => b.gap - a.gap)[0];
  if (skipped && skipped.gap >= 0.4) {
    const { l } = skipped;
    out.push({
      id: `lesson:${l.scaleCode}:${l.title}`,
      tone: "watch",
      title: `"${l.title}" is often skipped`,
      evidence: `${l.done} of ${l.reach} with ${l.scaleCode} open finished it, against ${l.bestDone} for the most finished lesson in that scale.`,
      tryThis: "Check that the file opens well on a phone, and consider making it shorter or splitting it in two.",
    });
  }

  // Daily practice this week against last week.
  const { learners, practicedThisWeek, practicedLastWeek } = input.practice;
  if (learners >= MIN_SAMPLE) {
    const now = pct(practicedThisWeek, learners);
    const before = pct(practicedLastWeek, learners);
    if (now <= before - 15) {
      out.push({
        id: "practice:drop",
        tone: "fix",
        title: "Fewer students are practicing than last week",
        evidence: `${now}% of ${learners} learners practiced this week, down from ${before}% the week before.`,
        tryThis: "Send a practice reminder from People to follow up with on the Overview, and mention the streak in your next class.",
        href: "/admin/users?filter=idle",
      });
    } else if (now < 50) {
      out.push({
        id: "practice:low",
        tone: "watch",
        title: "Most students skip the daily 10 minutes",
        evidence: `${practicedThisWeek} of ${learners} learners (${now}%) practiced at least once in the last 7 days.`,
        tryThis: "Turn on practice reminders in Settings, or start each class with two minutes of the week's finger exercise.",
        href: "/admin/users?filter=idle",
      });
    } else if (now >= 75) {
      out.push({
        id: "practice:good",
        tone: "good",
        title: "Practice is a habit for most students",
        evidence: `${practicedThisWeek} of ${learners} learners (${now}%) practiced in the last 7 days.`,
        tryThis: "Keep it going: call out streaks in class.",
      });
    }
  }

  // Classes: missed classes and classes nobody marked.
  const { held, noShow, unmarked, canceledByStudent } = input.classes;
  const marked = held - unmarked;
  if (marked >= MIN_SAMPLE && noShow / marked >= 0.15) {
    out.push({
      id: "classes:no-show",
      tone: noShow / marked >= 0.3 ? "fix" : "watch",
      title: "Students are missing booked classes",
      evidence: `${noShow} of ${marked} marked classes in the last 30 days were no-shows (${pct(noShow, marked)}%).`,
      tryThis: "Make sure class reminders are on, and check whether the missed classes share a day or time.",
      href: "/admin/schedule",
    });
  }
  if (unmarked >= MIN_SAMPLE) {
    out.push({
      id: "classes:unmarked",
      tone: "watch",
      title: "Attendance is not being marked",
      evidence: `${unmarked} of ${held} classes in the last 30 days have no attendance.`,
      tryThis: "Mark attendance on Classes > Today right after each class; credits and no-show figures depend on it.",
      href: "/admin/today",
    });
  }
  if (held + canceledByStudent >= MIN_SAMPLE * 2 && canceledByStudent / (held + canceledByStudent) >= 0.25) {
    out.push({
      id: "classes:cancels",
      tone: "watch",
      title: "Many classes are canceled",
      evidence: `${canceledByStudent} of ${held + canceledByStudent} classes in the last 30 days were canceled (${pct(canceledByStudent, held + canceledByStudent)}%).`,
      tryThis: "Ask a few students whether their weekly time still suits them; the waitlist shows which times people want.",
      href: "/admin/schedule",
    });
  }

  // Atom: how often answers get a thumbs down.
  const { up, down, handoffs } = input.atom;
  if (up + down >= MIN_SAMPLE * 2) {
    const downRate = down / (up + down);
    if (downRate >= 0.3) {
      out.push({
        id: "atom:down",
        tone: downRate >= 0.5 ? "fix" : "watch",
        title: "Atom's answers often miss",
        evidence: `${down} of ${up + down} rated answers in the last 30 days got a thumbs down; ${handoffs} chat${handoffs === 1 ? "" : "s"} were handed to a person.`,
        tryThis: "Read the handed-over chats in Inbox > Support Chat to see what people asked, and add those answers to Atom's instructions.",
        href: "/admin/support",
      });
    } else if (downRate <= 0.1) {
      out.push({
        id: "atom:good",
        tone: "good",
        title: "Atom's answers land well",
        evidence: `${up} of ${up + down} rated answers in the last 30 days got a thumbs up.`,
        tryThis: "Nothing to change.",
      });
    }
  }

  // Trials that turn into plans.
  const { started, startedPlan } = input.trials;
  if (started >= MIN_SAMPLE) {
    const rate = startedPlan / started;
    if (rate < 0.3) {
      out.push({
        id: "trials:low",
        tone: rate < 0.15 ? "fix" : "watch",
        title: "Few free trials become plans",
        evidence: `${startedPlan} of ${started} trials started in the last 90 days led to a plan (${pct(startedPlan, started)}%).`,
        tryThis: "Reach out on the last day of a trial (Overview > People to follow up with) and offer to book their first class.",
        href: "/admin/students",
      });
    } else if (rate >= 0.5) {
      out.push({
        id: "trials:good",
        tone: "good",
        title: "Trials convert well",
        evidence: `${startedPlan} of ${started} trials in the last 90 days led to a plan (${pct(startedPlan, started)}%).`,
        tryThis: "Nothing to change.",
      });
    }
  }

  // Bills that are late.
  const { active, overdue } = input.plans;
  if (active >= MIN_SAMPLE && overdue / active >= 0.2) {
    out.push({
      id: "plans:overdue",
      tone: overdue / active >= 0.4 ? "fix" : "watch",
      title: "A lot of bills are late",
      evidence: `${overdue} of ${active} running plans have an overdue bill (${pct(overdue, active)}%).`,
      tryThis: "Send the one-click bill reminder from the Overview, and check that payment emails are reaching the app (Billing > Payments).",
      href: "/admin/payment-plans",
    });
  }

  const order: Record<InsightTone, number> = { fix: 0, watch: 1, good: 2 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}

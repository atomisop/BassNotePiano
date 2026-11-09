// What an applicant's card on Admin > People > Applicants offers next, so the studio goes from "approved" to a student with a plan
// without hunting for the account. Pure (no database), so the choices are tested.

export interface ApplicantForSteps {
  status: "PENDING" | "APPROVED" | "REJECTED";
  fullName: string;
  email: string;
  phone: string;
  account: { id: string; banned: boolean; onPlan: boolean } | null;
}

export type ApplicantStep =
  | { kind: "setup"; label: string; href: string }
  | { kind: "book"; label: string; href: string }
  | { kind: "signUpLink"; label: string }
  | { kind: "hold"; label: string; href: string };

/** Admin > Classes > Schedule > Reserved, opened with a new reservation already filled in for this person. */
export function holdTimeHref(a: { fullName: string; email: string; phone: string }): string {
  const q = new URLSearchParams({ view: "RESERVED", name: a.fullName, email: a.email, phone: a.phone });
  return `/admin/schedule?${q.toString()}`;
}

/**
 * The buttons under an approved applicant, first one first (the main action). With an account: set up their plan and book their
 * first class on their page. With none yet: send them the sign-up link, and hold a weekly time for them meanwhile. Nothing for a
 * pending application (Approve and Reject come first), a rejected one, or a banned account.
 */
export function applicantNextSteps(a: ApplicantForSteps): ApplicantStep[] {
  if (a.status !== "APPROVED") return [];
  if (a.account) {
    if (a.account.banned) return [];
    const page = `/admin/users/${a.account.id}`;
    return [
      { kind: "setup", label: a.account.onPlan ? "Change plan" : "Set up plan", href: `${page}?do=setup` },
      { kind: "book", label: a.account.onPlan ? "Book a class" : "Book first class", href: `${page}?do=book` },
    ];
  }
  return [
    { kind: "signUpLink", label: "Send sign-up link" },
    { kind: "hold", label: "Hold a time", href: holdTimeHref(a) },
  ];
}

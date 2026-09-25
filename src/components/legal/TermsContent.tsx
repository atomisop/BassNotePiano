// Single source of truth for the terms/refund copy — rendered on the
// public /terms page (linked from registration and both purchase flows,
// where there's no session yet) and inside the signed-in About page's
// "Terms & refunds" tab. Keeping this in one place means the two surfaces
// can never quietly drift out of sync with each other.

import { FAMILY_BUNDLE_DISCOUNT_RATE } from "@/lib/classCreditPricing";

export const TERMS_LAST_UPDATED = "September 25, 2026";

function TermsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-ink/10 pb-6 last:border-b-0 last:pb-0">
      <h2 className="font-serif text-base text-slate-50">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate-400">{children}</div>
    </div>
  );
}

export function TermsContent() {
  return (
    <div className="space-y-6">
      <TermsSection title="Your account">
        <p>
          One account per person. Don&apos;t share your login, and don&apos;t share purchased access (curriculum or
          class credits) with anyone who hasn&apos;t paid for it themselves. Access is for the account holder only,
          not transferable or resellable. We can suspend or close accounts that violate this.
        </p>
      </TermsSection>

      <TermsSection title="Curriculum (included with live classes)">
        <p>
          The curriculum isn&apos;t sold separately. It comes with an active class plan, and your teacher opens it one
          scale at a time as you progress. When a plan ends, curriculum access continues until the end of the month
          you already paid for, then closes. Approved applicants get a 3-day free trial of the first lessons.
        </p>
        <p>
          <span className="font-medium text-[rgb(var(--c-s-50))]">Payments are final.</span> Curriculum content is digital
          and shared only with the student it was opened for, so it can&apos;t be refunded once access is granted.
        </p>
      </TermsSection>

      <TermsSection title="Class credits & bundles">
        <p>
          Solo class credits come from a Payment Plan — Monthly, 3-Month, or 6-Month, paid one Zelle
          installment at a time, longer terms at a lower rate. Enrolling reserves your weekly day and time
          exclusively and auto-books it every week for as long as the plan stays active. If you skip a week, make
          it up on another week before that installment&apos;s monthly cycle ends — an unused credit is forfeited
          once its cycle expires.
        </p>
        <p>
          Family bundles use the same cadence and term rates a solo Payment Plan does, for 2 or more separate,
          already-existing accounts at once, paid as a single upfront payment for the whole term instead of monthly
          installments, plus an extra {FAMILY_BUNDLE_DISCOUNT_RATE * 100}% off the combined total. Family credits
          never expire.
        </p>
        <p>
          <span className="font-medium text-[rgb(var(--c-s-50))]">Money spent on credits is non-refundable.</span> The only way
          a credit itself comes back to your balance (never as cash) is by canceling a booking at least 24 hours
          before it starts. That&apos;s it; there&apos;s no other automatic refund path.
        </p>
      </TermsSection>

      <TermsSection title="Cancellations & no-shows">
        <p>
          A credit is never charged when you book. It&apos;s only charged once, at the lesson itself, when
          attendance is marked, present or absent. Canceling at least 24 hours ahead removes the booking before
          that ever happens, so nothing is charged.
        </p>
        <p>
          <span className="font-medium text-[rgb(var(--c-s-50))]">
            Once you&apos;re inside that 24-hour window, self-cancellation is turned off.
          </span>{" "}
          There&apos;s no button for it, and simply not showing up doesn&apos;t stop the charge either, since that
          time was already held for you. If something genuinely comes up in that window, message us directly; an
          exception at that point is a case-by-case call we make by hand, not something the app grants
          automatically.
        </p>
        <p>
          Booking a slot mainly to hold it and canceling or no-showing often isn&apos;t in the spirit of a one-on-one
          or family time slot, so we may cancel bookings or limit how many active bookings an account can hold if
          that becomes a pattern.
        </p>
      </TermsSection>

      <TermsSection title="Payment & Zelle">
        <p>
          Payments go through Zelle and are checked by hand before access or credits are granted, which is why
          it&apos;s not instant. Submitting a fake or altered payment reference to get access is fraud and results in
          the access being revoked and the account closed, no warning.
        </p>
        <p>
          Once access has been granted, reversing the underlying bank transfer instead of contacting us directly
          (a &quot;chargeback&quot; on a Zelle payment) will get the account suspended while we sort it out.
        </p>
      </TermsSection>

      <TermsSection title="Conduct & content">
        <p>
          Keep profile photos and messages appropriate: nothing offensive, nothing that isn&apos;t yours to post.
          We can remove content or restrict an account that doesn&apos;t follow this.
        </p>
      </TermsSection>

      <TermsSection title="Changes">
        <p>
          Pricing, the class schedule, and these terms can change going forward, but we won&apos;t retroactively change
          what you already paid for. Announcements and this page are how we&apos;ll let you know.
        </p>
      </TermsSection>

      <TermsSection title="Questions">
        <p>Message us directly through the app and we&apos;ll sort it out. We&apos;d rather talk than argue over fine print.</p>
      </TermsSection>
    </div>
  );
}

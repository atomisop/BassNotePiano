// Single source of truth for the terms/refund copy, rendered on the
// public /terms page (linked from registration and both purchase flows,
// where there's no session yet) and inside the signed-in About page's
// "Terms & refunds" tab. Keeping this in one place means the two surfaces
// can never quietly drift out of sync with each other.


export const TERMS_LAST_UPDATED = "November 9, 2026";

function TermsSection({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-24 border-b border-ink/10 pb-8 last:border-b-0 last:pb-0">
      <h2 className="text-title font-semibold text-slate-50">{title}</h2>
      <div className="mt-3 space-y-3 text-small leading-relaxed text-slate-400">{children}</div>
    </div>
  );
}

export function TermsContent() {
  return (
    <div className="space-y-8">
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
          scale at a time as you progress. When a plan ends, curriculum access continues until the end of the 28 days
          you already paid for, then closes. Every new account gets a 3-day free trial of the first lessons, once per person.
        </p>
        <p>
          <span className="font-medium text-slate-50">Payments are final.</span> Curriculum content is digital
          and shared only with the student it was opened for, so it can&apos;t be refunded once access is granted.
        </p>
      </TermsSection>

      <TermsSection title="Payment plans: how billing works" id="payment-plans">
        <p>
          <span className="font-medium text-slate-50">What you are buying.</span> A plan gives you one live 45-minute class a week.
          The plans are named 1 Month, 3 Months and 6 Months. 1 Month is a single bill with no commitment. 3 Months is 3 bills in a row. 6 Months
          is 6 bills in a row. Longer plans cost less per bill.
        </p>
        <p>
          <span className="font-medium text-slate-50">A &quot;month&quot; is 28 days, not a calendar month.</span> Every bill covers exactly 28
          days and exactly 4 classes. That means you are billed 13 times a year, not 12. A 3 Months plan is 84 days (about 2.8 calendar months) and a 6
          Months plan is 168 days (about 5.5 calendar months). Each bill has the same price as the first one, the price you saw before you started.
        </p>
        <p>
          <span className="font-medium text-slate-50">Starting.</span> Your plan starts when your first payment is approved. The price on
          the review screen is the price you pay. If our prices change while you are looking at it, you are asked to review it again before anything is
          created. After you start, your plan keeps the price it started at. Paying by Zelle or Venmo is described under &quot;Payment &amp; Zelle or
          Venmo&quot; below.
        </p>
        <p>
          <span className="font-medium text-slate-50">Your weekly time.</span> The day and time you pick is yours alone and is booked
          for you automatically every week while the plan is active. If you do not pay your first bill, we release that time after a few days so others
          can have it. Starting several plans in one week without paying for any of them is not allowed, and we may stop you from starting another until
          you pay or a few days pass.
        </p>
        <p>
          <span className="font-medium text-slate-50">Credits expire.</span> Each bill puts class credits on your account, one for each
          class. Those credits are good only until the end of that bill&apos;s 28 days. Credits you did not use by then expire. They do not roll over to
          the next bill and they are not paid back in money. Book your classes before the 28 days run out.
        </p>
        <p>
          <span className="font-medium text-slate-50">Switching, pausing and canceling.</span> You can switch to another plan length in
          Settings, under Manage membership. Your next bill then uses the new plan&apos;s price, and the bills you have already paid count toward the
          new plan. You cannot switch to a plan that asks for fewer bills than you have already paid. You can pause a plan for 1 to 4 weeks, once every
          90 days. You can cancel any time. Canceling ends the plan and frees your weekly time. You keep access for the 28 days you already paid for.
        </p>
        <p>
          <span className="font-medium text-slate-50">No refunds.</span> Money paid for a plan is not refunded, including for classes
          you did not attend or credits that expired.
        </p>
      </TermsSection>

      <TermsSection title="Group plans" id="family-plans">
        <p>
          <span className="font-medium text-slate-50">Who can be in one.</span> A group plan is for 2 to 8 people. Everyone needs their own
          account in their own name. The person who sets it up is the payer and is also a student on the plan. Each person pays a lower price than the
          solo price.
        </p>
        <p>
          <span className="font-medium text-slate-50">Nobody is added without saying yes.</span> The payer sends each person an invitation.
          Nothing is created for you, and nothing is held for you, until you accept it. An invitation lasts 7 days. If you decline, the same person
          cannot invite you again for 30 days. You can only be on one plan at a time, so any plan of your own has to end before you can join.
        </p>
        <p>
          <span className="font-medium text-slate-50">The payer pays for everyone.</span> The payer makes one combined first payment from
          their own bank account, and then pays each person&apos;s bill every 28 days. The plan starts for everyone together, or for nobody. If the
          payer stops paying, every plan in the group ends when its paid 28 days run out. If the payer cancels, the group plan ends for everyone. If
          someone else leaves and only one person is left, that person pays the solo price from their next bill. A group can be changed only once in a
          limited period, so people cannot move in and out for the discount.
        </p>
        <p>
          <span className="font-medium text-slate-50">It is not a group class.</span> The weekly time chosen when the plan is set up is
          the payer&apos;s own. Everyone else gets their class credits on their own account when the payer pays, and then picks their own class times
          with them, one class a week, in Lessons. Each person has their own teacher time. Nobody is booked into someone else&apos;s class.
        </p>
        <p>
          <span className="font-medium text-slate-50">Credits expire.</span> The same rule applies to everyone in the group: credits are
          good until the end of that bill&apos;s 28 days, and unused credits expire. The payer is not paid back for credits other people did not use.
        </p>
      </TermsSection>

      <TermsSection title="Parent mode" id="parent-mode">
        <p>
          <span className="font-medium text-slate-50">Linking is by invitation.</span> A parent can ask to link to a child&apos;s own account
          by its email. Nothing is shared until the child accepts. Either side can end the link at any time in Settings. A request that was declined
          cannot be sent again by the same person for 30 days.
        </p>
        <p>
          <span className="font-medium text-slate-50">What a linked parent can do.</span> See the child&apos;s progress, practice and classes,
          book, move or cancel their classes (the same rules as for the child, including the cancellation cutoff), move their weekly time, and pay for their
          plan. A parent does not have to be on a plan to pay for a child, and can also learn on a plan of their own.
        </p>
        <p>
          <span className="font-medium text-slate-50">Paying.</span> The parent makes one combined first payment from their own bank account
          and then pays each child&apos;s bill every 28 days. One child is priced like a solo plan; two or more people on the same payment get the group
          price. If the parent stops paying, the plans end when their paid 28 days run out. A parent leaving their own plan does not end their children&apos;s plans.
        </p>
      </TermsSection>

      <TermsSection title="Class credits & bundles">
        <p>
          Every class is 45 minutes, one-on-one. Your weekly classes come from a Payment Plan: 1 Month,
          3 Months, or 6 Months, paid one Zelle or Venmo installment every 28 days (so 13 bills a year, not 12; a plan&apos;s &ldquo;month&rdquo; is one 28-day bill), longer terms at a lower rate. Enrolling
          reserves your weekly day and time exclusively and auto-books it every week for as long as the plan stays
          active. You can skip or change a class up to 6 hours before it starts; inside 6 hours, please attend
          or message us. A skipped class stays on your account to rebook on another day, but it is forfeited if
          unused once that installment&apos;s 28-day cycle expires.
        </p>
        <p>
          Each installment is billed every 28 days, from one payment date to the next, and pays for exactly 4 classes: your
          weekly class, four times in those 28 days, whatever the month. The price of each payment is the same every time.
        </p>
        <p>
          Extra classes are $55 each, booked and paid for one at a time on the Lessons page, for more time on top of
          your weekly class. Credits cannot be bought. They come only as a gift, a refund or an employee benefit, and
          can be used when booking an extra class.
        </p>
        <p>
          <span className="font-medium text-slate-50">Money spent on credits is non-refundable.</span> The only way
          a credit itself comes back to your balance (never as cash) is by canceling a booking at least 6 hours
          before it starts. That&apos;s it; there&apos;s no other automatic refund path.
        </p>
      </TermsSection>

      <TermsSection title="Cancellations & no-shows">
        <p>
          A credit is never charged when you book. It&apos;s only charged once, at the lesson itself, when
          attendance is marked, present or absent. Canceling at least 6 hours ahead removes the booking before
          that ever happens, so nothing is charged.
        </p>
        <p>
          <span className="font-medium text-slate-50">
            Once you&apos;re inside that 6-hour window, self-cancellation is turned off.
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

      <TermsSection title="Payment & Zelle or Venmo">
        <p>
          Payments go through Zelle or Venmo and are checked by hand before access or credits are granted, which is why
          it&apos;s not instant. For returning students, an installment unlocks right away and is checked
          afterward. Submitting a fake or altered payment reference to get access is fraud and results in
          the access being revoked and the account closed, no warning.
        </p>
        <p>
          Once access has been granted, reversing the underlying bank transfer instead of contacting us directly
          (a &quot;chargeback&quot; on a Zelle or Venmo payment) will get the account suspended while we sort it out.
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

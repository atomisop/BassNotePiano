// Single source of truth for the privacy copy — rendered on the public
// /privacy page and linked from registration, the same pattern
// TermsContent.tsx already uses for the terms/refund policy.
//
// Written to describe what this app actually does, not a generic template:
// every claim below should stay true to the real data model (prisma/schema.prisma)
// and the real third parties actually wired up in src/lib (Resend, Cloudflare
// R2, Neon, Google's Gemini API, Sentry). If a new integration starts
// collecting or sending user data somewhere new, this page needs updating in
// the same change. The assistant.ts system prompt has its own condensed
// summary of this page that needs to stay in sync too, since Atom quotes it.
//
// This pass specifically checked (and confirmed real, not hypothetical)
// against the app's actual code rather than assumed: Atom's Gemini calls
// include the visitor's name/curriculum status/credit balance when signed
// in, not just the raw message; the public class-registration form collects
// full name/email/phone with zero privacy disclosure before this pass; Atom
// conversations persist for signed-in visitors until an admin clears them;
// escalating to a person stores the full chat transcript for admins to
// read; and the family bundle feature reveals to a signed-in buyer whether
// an email they type has an account. Account deletion now actually deletes
// the stored avatar file, not just the database row pointing at it: a real
// gap this pass fixed in the code, not just in what this page claims.
export const PRIVACY_LAST_UPDATED = "October 2, 2026";

function PrivacySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-ink/10 pb-6 last:border-b-0 last:pb-0">
      <h2 className="font-serif text-base text-slate-50">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate-400">{children}</div>
    </div>
  );
}

export function PrivacyContent() {
  return (
    <div className="space-y-6">
      <PrivacySection title="What we collect">
        <p>
          What you give us directly: your name, email, and password when you register; your
          profile photo, instrument, skill level, and goals if you fill those in; messages you
          send to friends or groups inside the app; private notes you write on a scale&apos;s lesson
          page (visible only to you, deleted with your account); and, when you pay by Zelle, the sender name
          and reference code you type in so we can match your transfer. If you use the class
          registration form before creating an account, that&apos;s your name, email, phone number,
          instrument, skill level, and anything you add in the notes field.
        </p>
        <p>
          What the app generates from your use of it: your class bookings, credit balance,
          practice/streak activity, quiz results, and notification preferences.
        </p>
        <p>
          What Atom (our AI assistant) collects: the chat window itself always opens fresh, whether
          or not you&apos;re signed in. But if you are signed in, what you asked Atom is still saved to
          your account behind the scenes (readable anytime under Settings → Privacy &amp; Data) for
          30 days, then automatically deleted. If you&apos;re not signed in, nothing you say to Atom is
          stored on our servers at all; the conversation lives only in your browser and disappears
          the moment you reload. Either way, if you ask Atom to connect you with a real person,
          that handoff saves your contact info (name and email, or just your account if you&apos;re
          signed in) and the full conversation so an admin can read it and reply. If you rate one
          of Atom&apos;s replies (thumbs up or down), we keep that reply&apos;s text and your rating.
        </p>
      </PrivacySection>

      <PrivacySection title="What we don't collect">
        <p>
          We never see or store your bank account or card numbers. Zelle payments move directly
          between your bank and ours; the reference code you submit is just how we confirm which
          transfer was yours. We also don&apos;t run ad-tracking pixels or sell any of your data to
          anyone, ever, including to Google, whose AI we use to power Atom (more on that below).
        </p>
      </PrivacySection>

      <PrivacySection title="Who else sees it">
        <p>
          A handful of vendors process data on our behalf, strictly to run the app: Resend sends
          the emails the app triggers (verification codes, notifications), Cloudflare stores
          uploaded avatars and lesson video/PDF files, Neon hosts the database, Netlify hosts the
          app itself, and Sentry receives error reports when something breaks so we can fix it.
          Google&apos;s Gemini API is what actually generates Atom&apos;s replies: whatever you type to
          Atom is sent to Google to produce an answer, along with a few facts about your account
          (your name, whether you have curriculum access, your credit balance) so the reply can be
          personalized. How Google itself retains or uses that data beyond generating the reply is
          governed by Google&apos;s own API terms, not something we control past choosing to use
          their service. None of these vendors are permitted to use your data for their own
          purposes.
        </p>
        <p>
          Other students can see what you&apos;d expect from a social feature: your profile (name,
          username, photo) if you add each other as friends, and anything you send them directly.
          If someone buys a &quot;family bundle&quot; of class credits for other accounts (say, a parent
          buying for each of their kids), typing your email into that flow tells them whether an
          account exists at that address and the name on it. That check requires them to already
          be signed in and is rate-limited, specifically so it can&apos;t be used to mass-probe
          addresses. If they complete the purchase, you get notified that credits were added to
          your account. Admins can see registration, payment, and booking details needed to run
          classes and verify payments, plus the contents of any conversation you escalate to a
          real person through Atom.
        </p>
      </PrivacySection>

      <PrivacySection title="Cookies">
        <p>
          One cookie is strictly necessary and always on: the sign-in session that keeps you
          logged in. Nothing else is set without asking first: the cookie banner offers an
          analytics category for future use, but as of this writing no analytics tool is wired
          up in the app at all, so that choice does nothing yet.
        </p>
      </PrivacySection>

      <PrivacySection title="How long we keep it">
        <p>
          Your account, purchase and credit history, and everything else covered above stays for
          as long as your account exists. Nothing about it is automatically deleted just because
          you stop using the app. See the next section if you&apos;d like it removed sooner.
        </p>
        <p>
          Your ordinary back-and-forth with Atom is the one exception: it&apos;s automatically deleted
          30 days after it&apos;s saved, no request needed. Anonymous (not signed-in) visitors&apos; chats
          are never written to our servers in the first place, so there&apos;s nothing to retain for
          them at all. This doesn&apos;t apply to a conversation you&apos;ve escalated to a real person:
          that becomes a support record like any other, kept the same way the rest of your account
          is.
        </p>
      </PrivacySection>

      <PrivacySection title="Your choices">
        <p>
          Update your name, photo, learning preferences, and notification settings anytime from
          Settings, and see your own Atom conversation history (until it ages out on its own)
          under Settings → Privacy &amp; Data. To correct, export, or fully delete your account and
          everything tied to it sooner than that, message us directly through the app or contact
          us the same way you would for a billing question. This is a small, hands-on operation,
          so full account deletion is handled by a real person rather than a self-service button,
          and we&apos;ll confirm once it&apos;s done.
        </p>
      </PrivacySection>

      <PrivacySection title="Changes">
        <p>
          If what we collect or who we share it with changes, we&apos;ll update this page and the
          date at the top. Material changes get an announcement too, the same way policy or
          pricing changes do.
        </p>
      </PrivacySection>

      <PrivacySection title="Questions">
        <p>Message us directly through the app and we&apos;ll answer honestly, not with fine print.</p>
      </PrivacySection>
    </div>
  );
}

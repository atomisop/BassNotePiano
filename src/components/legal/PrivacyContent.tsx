// Single source of truth for the privacy copy — rendered on the public
// /privacy page and linked from registration, the same pattern
// TermsContent.tsx already uses for the terms/refund policy.
//
// Written to describe what this app actually does, not a generic template:
// every claim below should stay true to the real data model (prisma/schema.prisma)
// and the real third parties actually wired up in src/lib (Resend, Cloudflare
// R2, Neon, Sentry). If a new integration starts collecting or sending user
// data somewhere new, this page needs updating in the same change.

export const PRIVACY_LAST_UPDATED = "August 23, 2026";

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
          send to friends or groups inside the app; and, when you pay by Zelle, the sender name
          and reference code you type in so we can match your transfer.
        </p>
        <p>
          What the app generates from your use of it: your class bookings, credit balance,
          practice/streak activity, quiz results, and notification preferences.
        </p>
      </PrivacySection>

      <PrivacySection title="What we don't collect">
        <p>
          We never see or store your bank account or card numbers. Zelle payments move directly
          between your bank and ours; the reference code you submit is just how we confirm which
          transfer was yours. We also don&apos;t run ad-tracking pixels or sell any of your data to
          anyone, ever.
        </p>
      </PrivacySection>

      <PrivacySection title="Who else sees it">
        <p>
          A handful of vendors process data on our behalf, strictly to run the app: Resend sends
          the emails the app triggers (verification codes, notifications), Cloudflare stores
          uploaded avatars and lesson video/PDF files, Neon hosts the database, Netlify hosts the
          app itself, and Sentry receives error reports when something breaks so we can fix it.
          None of them are permitted to use your data for their own purposes.
        </p>
        <p>
          Other students can see what you&apos;d expect from a social feature: your profile (name,
          username, photo) if you add each other as friends, and anything you send them directly.
          Admins can see registration, payment, and booking details needed to run classes and
          verify payments.
        </p>
      </PrivacySection>

      <PrivacySection title="Cookies">
        <p>
          One cookie is strictly necessary and always on: the sign-in session that keeps you
          logged in. Nothing else is set without asking first — the cookie banner offers an
          analytics category for future use, but as of this writing no analytics tool is wired up
          in the app at all, so that choice does nothing yet.
        </p>
      </PrivacySection>

      <PrivacySection title="How long we keep it">
        <p>
          Your data stays for as long as your account exists. If you stop using the app, nothing
          is automatically deleted — see the next section if you&apos;d like it removed sooner.
        </p>
      </PrivacySection>

      <PrivacySection title="Your choices">
        <p>
          Update your name, photo, learning preferences, and notification settings anytime from
          Settings. To correct, export, or fully delete your account and its data, message us
          directly through the app or contact us the same way you would for a billing question —
          this is a small, hands-on operation, so account deletion is handled by a real person
          rather than a self-service button, and we&apos;ll confirm once it&apos;s done.
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

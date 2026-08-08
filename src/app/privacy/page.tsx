import type { Metadata } from "next";
import { LegalLayout, LegalSection } from "@/components/LegalLayout";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Privacy Policy — Bunal.club",
  description: "How Bunal.club collects, uses, and protects your data.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <PageShell maxWidth="max-w-none" padded={false} alwaysPublic>
      <LegalLayout title="Privacy Policy" updated="August 8, 2026">
        <p>
          This Privacy Policy explains how Bunal.club (&quot;we&quot;,
          &quot;us&quot;) collects, uses, and protects your personal
          information when you use our application and services.
        </p>

        <LegalSection heading="1. Information we collect">
          <p>When you register and use Bunal.club, we collect:</p>
          <ul className="list-disc pl-5">
            <li>
              <span className="font-medium text-gray-800">
                Account details
              </span>{" "}
              — your full name, player name, email address, and phone
              number.
            </li>
            <li>
              <span className="font-medium text-gray-800">Profile data</span>{" "}
              — your skill level, optional profile picture, and privacy
              preferences.
            </li>
            <li>
              <span className="font-medium text-gray-800">
                Security data
              </span>{" "}
              — if you enable two-factor authentication, whether it&apos;s
              active and one-way hashes of your recovery codes (never the
              codes themselves). If you sign in, we record the device,
              browser, and approximate location of that session, and a
              cryptographically hashed version of the IP address — never the
              raw address.
            </li>
            <li>
              <span className="font-medium text-gray-800">Activity</span> —
              the bookings you make and the events you register for.
            </li>
            <li>
              <span className="font-medium text-gray-800">Usage data</span> —
              pages visited, referral information, device and browser
              details, and interactions collected through analytics and
              advertising technologies.
            </li>
            <li>
              <span className="font-medium text-gray-800">
                Social messaging
              </span>{" "}
              — when you message the Bunal.club Facebook Page, Meta sends us
              the message and a Page-specific identifier so our automatic
              assistant or support team can reply. The assistant does not
              retain the message or identifier; it keeps only a one-way hash
              of the delivery id for 30 days to prevent duplicate replies.
            </li>
          </ul>
        </LegalSection>

        <LegalSection heading="2. How we use your information">
          <p>
            We use your information to operate the Service: to create and
            secure your account, connect you with courts and open-play
            events, communicate with you about bookings, and improve the
            experience. We do not sell your personal data.
          </p>
        </LegalSection>

        <LegalSection heading="3. Your privacy controls">
          <p>
            If you enable a private profile, your name and email are hidden
            from other players when you join sessions. You can change this
            setting at any time from your profile.
          </p>
        </LegalSection>

        <LegalSection heading="4. Payments">
          <p>
            For automatic checkout, Bunal.club never sees or stores your QR Ph
            account credentials. Court and event payments are processed by
            PayMongo and proceeds go directly into the venue&apos;s connected
            account. For manual checkout, Bunal.club stores the receipt image,
            optional transaction reference, and a snapshot of the venue&apos;s
            displayed payment instructions so the venue can review the
            booking. Bunal.club never holds player funds in transit.
          </p>
        </LegalSection>

        <LegalSection heading="5. Cookies and sessions">
          <p>
            Signing in sets a session cookie (
            <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
              authjs.session-token
            </code>
            , or a <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
              __Secure-
            </code>{" "}
            prefixed version over HTTPS) that keeps you signed in and is
            required for the Service to work. We also use Google Tag Manager
            for site analytics, and Vercel Analytics and Speed Insights to
            understand traffic and performance — see the Analytics section
            below.
          </p>
        </LegalSection>

        <LegalSection heading="6. How we protect your data">
          <p>
            Passwords are stored using one-way hashing and are never visible
            to us or anyone else. Two-factor authentication secrets are
            encrypted with AES-256-GCM, and recovery codes and login-attempt
            records are stored as one-way hashes rather than raw values. We
            use industry-standard measures to protect data in transit and at
            rest, though no method of transmission is ever completely
            secure.
          </p>
        </LegalSection>

        <LegalSection heading="7. Data sharing">
          <p>
            We share information only as needed to provide the Service:
          </p>
          <ul className="list-disc pl-5">
            <li>
              <span className="font-medium text-gray-800">PayMongo</span> —
              to process court and event payments (see Payments above).
            </li>
            <li>
              <span className="font-medium text-gray-800">Resend</span> — to
              deliver account emails such as password resets, welcome
              messages, and new-device sign-in alerts.
            </li>
            <li>
              <span className="font-medium text-gray-800">Venues</span> — the
              details needed to fulfill a specific booking or registration.
            </li>
            <li>
              <span className="font-medium text-gray-800">Google Maps</span>{" "}
              — loads only when a venue partner sets their hub&apos;s
              location in the partner dashboard.
            </li>
            <li>
              <span className="font-medium text-gray-800">Meta</span> —
              carries messages and automatic replies between you and the
              Bunal.club Facebook Page under Meta&apos;s own privacy terms.
            </li>
          </ul>
          <p>
            The public{" "}
            <span className="font-medium text-gray-800">Rankings</span> page
            displays club ratings sourced from DUPR&apos;s own public
            records — we don&apos;t send your data to DUPR. We may also
            disclose information where required by law.
          </p>
        </LegalSection>

        <LegalSection heading="8. Analytics and advertising">
          <p>
            We use Google Tag Manager to manage analytics and marketing tags
            and understand visits to Bunal.club, alongside Vercel Analytics
            and Speed Insights for site performance. Tags configured through
            Tag Manager may send page-view, browser, device, cookie or
            identifier, and IP-derived information to Google or other
            providers identified by an active tag. Those providers process
            the information under their own privacy terms. We do not
            intentionally send booking or payment details through these
            tracking tools.
          </p>
        </LegalSection>

        <LegalSection heading="9. Data retention">
          <p>
            We keep your information for as long as your account is active.
            When you delete your account, we remove or anonymize your
            personal data, except where we are required to retain it for
            legal or accounting purposes.
          </p>
        </LegalSection>

        <LegalSection heading="10. Your rights">
          <p>
            Depending on your location, you may have the right to access,
            correct, export, or delete your personal data. To exercise these
            rights, contact us at{" "}
            <a
              href="mailto:privacy@bunal.club"
              className="font-medium text-primary hover:underline"
            >
              privacy@bunal.club
            </a>
            .
          </p>
        </LegalSection>

        <LegalSection heading="11. Changes to this policy">
          <p>
            We may update this Privacy Policy from time to time. Material
            changes will be reflected by updating the &quot;Last
            updated&quot; date above.
          </p>
        </LegalSection>
      </LegalLayout>
    </PageShell>
  );
}

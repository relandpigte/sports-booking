import type { Metadata } from "next";
import { LegalLayout, LegalSection } from "@/components/LegalLayout";

export const metadata: Metadata = {
  title: "Privacy Policy — Bunal.club",
  description: "How Bunal.club collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated="June 4, 2026">
      <p>
        This Privacy Policy explains how Bunal.club (&quot;we&quot;,
        &quot;us&quot;) collects, uses, and protects your personal information
        when you use our application and services.
      </p>

      <LegalSection heading="1. Information we collect">
        <p>When you register and use Bunal.club, we collect:</p>
        <ul className="list-disc pl-5">
          <li>
            <span className="font-medium text-gray-800">Account details</span> —
            your full name, player name, email address, and phone number.
          </li>
          <li>
            <span className="font-medium text-gray-800">Profile data</span> —
            your skill level, optional profile picture, and privacy preferences.
          </li>
          <li>
            <span className="font-medium text-gray-800">Activity</span> — the
            games you join and bookings you make.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="2. How we use your information">
        <p>
          We use your information to operate the Service: to create and secure
          your account, match you with games and courts, communicate with you
          about bookings, and improve the experience. We do not sell your personal
          data.
        </p>
      </LegalSection>

      <LegalSection heading="3. Your privacy controls">
        <p>
          If you enable a private profile, your name and email are hidden from
          other players when you join sessions. You can change this setting at any
          time from your profile.
        </p>
      </LegalSection>

      <LegalSection heading="4. How we protect your data">
        <p>
          Passwords are stored using one-way hashing and are never visible to us
          or anyone else. We use industry-standard measures to protect data in
          transit and at rest, though no method of transmission is ever completely
          secure.
        </p>
      </LegalSection>

      <LegalSection heading="5. Data sharing">
        <p>
          We share information only as needed to provide the Service — for
          example, with venues to fulfill a booking, or with service providers who
          process data on our behalf under appropriate confidentiality
          obligations. We may also disclose information where required by law.
        </p>
      </LegalSection>

      <LegalSection heading="6. Data retention">
        <p>
          We keep your information for as long as your account is active. When you
          delete your account, we remove or anonymize your personal data, except
          where we are required to retain it for legal or accounting purposes.
        </p>
      </LegalSection>

      <LegalSection heading="7. Your rights">
        <p>
          Depending on your location, you may have the right to access, correct,
          export, or delete your personal data. To exercise these rights, contact
          us at{" "}
          <a
            href="mailto:privacy@bunal.ph"
            className="font-medium text-primary hover:underline"
          >
            privacy@bunal.ph
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading="8. Changes to this policy">
        <p>
          We may update this Privacy Policy from time to time. Material changes
          will be reflected by updating the &quot;Last updated&quot; date above.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}

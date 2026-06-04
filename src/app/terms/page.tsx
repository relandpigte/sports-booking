import type { Metadata } from "next";
import { LegalLayout, LegalSection } from "@/components/LegalLayout";

export const metadata: Metadata = {
  title: "Terms & Conditions — Sports 360",
  description: "The terms and conditions for using the Sports 360 app.",
};

export default function TermsPage() {
  return (
    <LegalLayout title="Terms & Conditions" updated="June 4, 2026">
      <p>
        Welcome to Sports 360. These Terms &amp; Conditions (&quot;Terms&quot;)
        govern your access to and use of the Sports 360 application and related
        services (the &quot;Service&quot;). By creating an account or using the
        Service, you agree to be bound by these Terms.
      </p>

      <LegalSection heading="1. Eligibility">
        <p>
          You must be at least 16 years old to create an account. By registering,
          you confirm that the information you provide is accurate and that you
          are legally permitted to use the Service.
        </p>
      </LegalSection>

      <LegalSection heading="2. Your account">
        <p>
          You are responsible for safeguarding your password and for any activity
          under your account. Choose a strong password, keep it confidential, and
          notify us promptly of any unauthorized use. We store passwords only in a
          hashed form and can never see them.
        </p>
      </LegalSection>

      <LegalSection heading="3. Bookings and games">
        <p>
          Court bookings and game sessions are subject to availability and the
          rules of the participating venues. You agree to honor your bookings and
          to treat other players, hosts, and venue staff with respect. Repeated
          no-shows or abusive behavior may result in suspension.
        </p>
      </LegalSection>

      <LegalSection heading="4. Acceptable use">
        <p>
          You agree not to misuse the Service, including by attempting to access
          it through unauthorized means, disrupting its operation, harassing other
          users, or uploading unlawful or harmful content. We may remove content
          or restrict accounts that violate these Terms.
        </p>
      </LegalSection>

      <LegalSection heading="5. Privacy">
        <p>
          Your use of the Service is also governed by our Privacy Policy, which
          explains what data we collect and how we use it. Please review it to
          understand our practices.
        </p>
      </LegalSection>

      <LegalSection heading="6. Termination">
        <p>
          You may delete your account at any time. We may suspend or terminate
          access if you breach these Terms or use the Service in a way that could
          cause harm to us or other users.
        </p>
      </LegalSection>

      <LegalSection heading="7. Changes to these Terms">
        <p>
          We may update these Terms from time to time. When we do, we will revise
          the &quot;Last updated&quot; date above. Continued use of the Service
          after changes take effect constitutes acceptance of the revised Terms.
        </p>
      </LegalSection>

      <LegalSection heading="8. Contact">
        <p>
          Questions about these Terms? Reach us at{" "}
          <a
            href="mailto:support@sports360.app"
            className="font-medium text-primary hover:underline"
          >
            support@sports360.app
          </a>
          .
        </p>
      </LegalSection>
    </LegalLayout>
  );
}

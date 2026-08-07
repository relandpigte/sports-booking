import type { Metadata } from "next";
import { LegalLayout, LegalSection } from "@/components/LegalLayout";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Terms & Conditions — Bunal.club",
  description: "The terms and conditions for using the Bunal.club app.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <PageShell maxWidth="max-w-none" padded={false} alwaysPublic>
      <LegalLayout title="Terms & Conditions" updated="August 5, 2026">
        <p>
          Welcome to Bunal.club. These Terms &amp; Conditions
          (&quot;Terms&quot;) govern your access to and use of the
          Bunal.club application and related services (the
          &quot;Service&quot;). By creating an account or using the Service,
          you agree to be bound by these Terms.
        </p>

        <LegalSection heading="1. Eligibility">
          <p>
            You must be at least 16 years old to create an account. By
            registering, you confirm that the information you provide is
            accurate and that you are legally permitted to use the Service.
          </p>
        </LegalSection>

        <LegalSection heading="2. Your account and security">
          <p>
            You are responsible for safeguarding your password and for any
            activity under your account. Choose a strong password, keep it
            confidential, and notify us promptly of any unauthorized use. We
            store passwords only in a hashed form and can never see them.
            You can add two-factor authentication from your account settings
            for extra protection, and review active sessions and recent
            sign-ins at any time.
          </p>
        </LegalSection>

        <LegalSection heading="3. Bookings and payments">
          <p>
            Court bookings are subject to real-time availability and the
            rules of the participating venue. When a venue takes payment
            online, the venue selects either automatic PayMongo QR Ph or
            partner-reviewed manual transfer. Selected hours are held for a
            limited window while you pay. Automatic checkout includes the
            displayed Bunal.club service fee and may include a PayMongo
            processing fee. Manual checkout includes a 2.5% Bunal.club service
            fee, requires an on-time receipt upload, and remains pending until
            venue approval; no PayMongo processing fee is added.
            Automatic refunds are returned through PayMongo; manual refunds
            are returned by the venue through the original network.
            Bunal.club&apos;s checkout service fee is non-refundable;
            all other refund and no-show handling follows the venue&apos;s policy.
          </p>
        </LegalSection>

        <LegalSection heading="4. Events and open play">
          <p>
            Event registration is subject to the event&apos;s capacity —
            once full, new registrations join a waitlist. Where an event
            carries a registration fee, the same payment mechanics described
            above apply.
          </p>
        </LegalSection>

        <LegalSection heading="5. Partner venues">
          <p>
            Venues listed on Bunal.club are independent businesses,
            responsible for their own courts, facilities, safety, staff, and
            advertised rates. Bunal.club operates the booking platform that
            connects players and venues — we do not own, staff, or operate
            any court or venue.
          </p>
        </LegalSection>

        <LegalSection heading="6. Acceptable use">
          <p>
            You agree not to misuse the Service, including by attempting to
            access it through unauthorized means, disrupting its operation,
            harassing other users, or uploading unlawful or harmful content.
            You agree to honor your bookings and treat other players, hosts,
            and venue staff with respect — repeated no-shows or abusive
            behavior may result in suspension. We may remove content or
            restrict accounts that violate these Terms.
          </p>
        </LegalSection>

        <LegalSection heading="7. Privacy">
          <p>
            Your use of the Service is also governed by our{" "}
            <a
              href="/privacy"
              className="font-medium text-primary hover:underline"
            >
              Privacy Policy
            </a>
            , which explains what data we collect and how we use it. Please
            review it to understand our practices.
          </p>
        </LegalSection>

        <LegalSection heading="8. Disclaimers and limitation of liability">
          <p>
            The Service is provided &quot;as is,&quot; without warranties of
            any kind. Bunal.club is not responsible for the condition of any
            court or venue, the conduct of players or venue staff, or delays
            or failures caused by a third-party payment processor. To the
            fullest extent permitted by law, Bunal.club&apos;s liability for
            any claim arising from your use of the Service is limited to the
            service fee you paid on the booking giving rise to the claim.
          </p>
        </LegalSection>

        <LegalSection heading="9. Termination">
          <p>
            You may delete your account at any time. We may suspend or
            terminate access if you breach these Terms or use the Service in
            a way that could cause harm to us or other users.
          </p>
        </LegalSection>

        <LegalSection heading="10. Governing law">
          <p>
            These Terms are governed by the laws of the Republic of the
            Philippines, without regard to its conflict-of-law principles.
          </p>
        </LegalSection>

        <LegalSection heading="11. Changes to these Terms">
          <p>
            We may update these Terms from time to time. When we do, we will
            revise the &quot;Last updated&quot; date above. Continued use of
            the Service after changes take effect constitutes acceptance of
            the revised Terms.
          </p>
        </LegalSection>

        <LegalSection heading="12. Contact">
          <p>
            Questions about these Terms? Reach us at{" "}
            <a
              href="mailto:support@bunal.club"
              className="font-medium text-primary hover:underline"
            >
              support@bunal.club
            </a>
            .
          </p>
        </LegalSection>
      </LegalLayout>
    </PageShell>
  );
}

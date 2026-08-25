// Every transactional email uses the shared Bunal.club brand shell.
//
//   npm run check:email-templates
import { ok, run } from "./harness";
import {
  partnerBookingNotificationEmailContent,
  playerBookingConfirmedEmailContent,
  playerBookingDeclinedEmailContent,
  playerManualReceiptReceivedEmailContent,
} from "@/lib/booking-notification-email";
import type { TransactionalEmailContent } from "@/lib/email-html";
import { partnerApprovalEmailContent } from "@/lib/partner-approval-email";
import { partnerAssistanceEmailContent } from "@/lib/partner-assistance-email";
import { passwordResetEmailContent } from "@/lib/password-reset-email";
import { newDeviceLoginEmailContent } from "@/lib/security-alert-email";
import { serviceFeeOverdueEmailContent } from "@/lib/service-fee-notification-email";
import { staffInvitationEmailContent } from "@/lib/staff-invitation-email";
import { trainerLifecycleEmailContent } from "@/lib/trainer-email";
import { welcomeEmailContent } from "@/lib/welcome-email";

const APP_URL = "https://www.bunal.club";

async function check() {
  const templates: Array<{
    name: string;
    content: TransactionalEmailContent;
  }> = [
    {
      name: "password reset",
      content: passwordResetEmailContent(`${APP_URL}/reset-password?token=test`),
    },
    {
      name: "player welcome",
      content: welcomeEmailContent({
        audience: "PLAYER",
        name: "Player <One>",
        actionUrl: `${APP_URL}/hubs`,
      }),
    },
    {
      name: "partner welcome",
      content: welcomeEmailContent({
        audience: "PARTNER",
        name: "Venue Owner",
        actionUrl: `${APP_URL}/dashboard/partner`,
      }),
    },
    {
      name: "partner approval",
      content: partnerApprovalEmailContent({
        name: "Venue Owner",
        venueName: "Bunal Club Hub",
        actionUrl: `${APP_URL}/dashboard/partner`,
      }),
    },
    {
      name: "partner assistance",
      content: partnerAssistanceEmailContent({
        name: "Venue Owner",
        adminName: "Bunal Support",
        expiresAt: new Date("2030-01-02T03:30:00.000Z"),
        actionUrl: `${APP_URL}/dashboard/partner`,
      }),
    },
    {
      name: "security alert",
      content: newDeviceLoginEmailContent({
        name: "Player One",
        device: "Chrome on macOS",
        location: "Manila",
        occurredAt: new Date("2030-01-02T03:30:00.000Z"),
        securityUrl: `${APP_URL}/dashboard/account`,
      }),
    },
    {
      name: "staff invitation",
      content: staffInvitationEmailContent({
        partnerName: "Bunal Club Hub",
        inviterName: "Venue Owner",
        permissions: ["Bookings", "Payments"],
        acceptUrl: `${APP_URL}/staff/invite/test`,
        expiresAt: new Date("2030-01-02T03:30:00.000Z"),
      }),
    },
    {
      name: "partner booking",
      content: partnerBookingNotificationEmailContent({
        partnerName: "Venue Owner",
        playerName: "Player One",
        kind: "COURT",
        venueName: "Bunal Club Hub",
        bookingTitle: "Court 1",
        schedule: "January 2, 2030 · 9:00 AM–10:00 AM",
        status: "Confirmed",
        actionUrl: `${APP_URL}/dashboard/bookings`,
      }),
    },
    {
      name: "player confirmation",
      content: playerBookingConfirmedEmailContent({
        playerName: "Player One",
        venueName: "Bunal Club Hub",
        bookingTitle: "Court 1",
        schedule: "January 2, 2030 · 9:00 AM–10:00 AM",
        actionUrl: `${APP_URL}/dashboard/bookings`,
        paymentMode: "AUTOMATIC",
      }),
    },
    {
      name: "manual receipt",
      content: playerManualReceiptReceivedEmailContent({
        playerName: "Player One",
        venueName: "Bunal Club Hub",
        bookingTitle: "Court 1",
        schedule: "January 2, 2030 · 9:00 AM–10:00 AM",
        actionUrl: `${APP_URL}/dashboard/bookings`,
      }),
    },
    {
      name: "booking declined",
      content: playerBookingDeclinedEmailContent({
        playerName: "Guest Player",
        venueName: "Bunal Club Hub",
        bookingTitle: "Court 1",
        schedule: "January 2, 2030 · 9:00 AM–10:00 AM",
        reason: "The transfer could not be verified.",
        actionUrl: `${APP_URL}/bookings/access/test`,
      }),
    },
    {
      name: "service-fee reminder",
      content: serviceFeeOverdueEmailContent({
        partnerName: "Venue Owner",
        reminderKind: "DUE_SOON",
        overdueAmount: 0,
        amountDue: 75,
        dueAt: new Date("2030-01-03T00:00:00.000Z"),
        enforcementAt: new Date("2030-01-06T00:00:00.000Z"),
        blocked: false,
        actionUrl: `${APP_URL}/dashboard/payments`,
      }),
    },
    {
      name: "trainer service-fee alert",
      content: serviceFeeOverdueEmailContent({
        partnerName: "Coach One",
        accountType: "TRAINER",
        reminderKind: "OVERDUE",
        overdueAmount: 30,
        amountDue: 30,
        dueAt: new Date("2030-01-02T00:00:00.000Z"),
        enforcementAt: new Date("2030-01-05T00:00:00.000Z"),
        blocked: true,
        actionUrl: `${APP_URL}/dashboard/trainer/payments`,
      }),
    },
    {
      name: "trainer lifecycle",
      content: trainerLifecycleEmailContent({
        recipientName: "Coach <One>",
        subject: "New trainer-session request",
        heading: "A player requested your time",
        message: "Review the requested date and respond within 12 hours.",
        actionUrl: `${APP_URL}/dashboard/trainer/sessions`,
        actionLabel: "Review request",
      }),
    },
  ];

  ok("the inventory covers every transactional email family", templates.length === 14);

  for (const { name, content } of templates) {
    ok(
      `${name} uses the complete Bunal.club brand shell`,
      content.html.includes(`${APP_URL}/bunal-logo-v2-wordmark.png`) &&
        content.html.includes('role="presentation"') &&
        content.html.includes("#10243a") &&
        content.html.includes("#16803c") &&
        content.html.includes("#a3ce3c") &&
        content.html.includes("Play") &&
        content.html.includes("Compete") &&
        content.html.includes("Connect") &&
        content.html.includes("Transactional email from") &&
        content.html.includes(`${APP_URL}/privacy`)
    );
    ok(
      `${name} includes accessible delivery fallbacks`,
      content.html.includes('alt="Bunal.club"') &&
        content.html.includes("Button not working?") &&
        content.html.includes('name="viewport"') &&
        content.text.includes(content.subject) &&
        content.text.includes(APP_URL) &&
        content.text.includes("Bunal.club — Play · Compete · Connect")
    );
  }

  const trainer = templates.find((template) => template.name === "trainer lifecycle");
  ok(
    "trainer lifecycle content is escaped inside the shared shell",
    trainer?.content.html.includes("Coach &lt;One&gt;") === true &&
      trainer.content.html.includes("Coach <One>") === false
  );
}

void run(check);

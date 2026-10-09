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
import { passwordResetEmailContent } from "@/lib/password-reset-email";
import { PAYOUT_EMAIL_MAX_LINES, payoutEmailContent } from "@/lib/payout-email";
import { newDeviceLoginEmailContent } from "@/lib/security-alert-email";
import { serviceFeeOverdueEmailContent } from "@/lib/service-fee-notification-email";
import { staffInvitationEmailContent } from "@/lib/staff-invitation-email";
import { formatManilaDateLong } from "@/lib/time";
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
      name: "payout sent",
      content: payoutEmailContent({
        kind: "SENT",
        recipientName: "Venue Owner",
        amount: 1250,
        // 01:30 UTC is 09:30 in Manila on the same civil date.
        paidAt: new Date("2030-01-03T01:30:00.000Z"),
        destination: "GCash account ending in 4567",
        account: "GCash · Juan Dela Cruz · •••• 4567",
        reference: "GC-REF-0001",
        coversThrough: "2030-01-02",
        earnings: 1500,
        earningCount: 2,
        refunds: -250,
        lines: [
          {
            title: "Smash Hub · Court 1",
            detail: "Tue, Jan 1, 6:00 PM – 8:00 PM · Ana Reyes",
            amount: 1000,
          },
          {
            title: "Friday Open Play · Smash Hub",
            detail: "Wed, Jan 2 · 2 spots · Ben <Cruz>",
            amount: 500,
          },
          {
            title: "Refund · Smash Hub · Court 2",
            detail: null,
            amount: -250,
          },
        ],
        message: "Salamat!\n<script>alert(1)</script>",
        actionUrl: `${APP_URL}/dashboard/payments`,
      }),
    },
    {
      name: "payout account changed",
      content: payoutEmailContent({
        kind: "ACCOUNT_CHANGED",
        recipientName: "Coach One",
        destination: "BDO account ending in 7890",
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

  ok("the inventory covers every transactional email family", templates.length === 15);

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

  const payout = templates.find((template) => template.name === "payout sent")!
    .content;
  ok(
    "the payout email states the exact amount, in the subject and the body",
    payout.subject === "Your ₱1,250.00 Bunal.club payout was sent" &&
      payout.html.includes("₱1,250.00 is on its way") &&
      payout.text.includes("Amount sent: ₱1,250.00") &&
      payout.text.includes("Total sent: ₱1,250.00")
  );
  for (const part of [payout.html, payout.text]) {
    const kind = part === payout.html ? "HTML" : "plain-text";
    ok(
      `the ${kind} part carries the transfer details`,
      part.includes("GC-REF-0001") &&
        part.includes("GCash · Juan Dela Cruz · •••• 4567") &&
        // Sent 01:30 UTC on the 3rd, which is still the 3rd in Manila.
        part.includes(formatManilaDateLong("2030-01-03")) &&
        part.includes(formatManilaDateLong("2030-01-02")) &&
        part.includes("Earned (2 payments)") &&
        part.includes("₱1,500.00") &&
        part.includes("Refunds deducted") &&
        part.includes("−₱250.00")
    );
    ok(
      `the ${kind} part lists every line the payout covers`,
      part.includes("Smash Hub · Court 1") &&
        part.includes("Tue, Jan 1, 6:00 PM – 8:00 PM · Ana Reyes") &&
        part.includes("₱1,000.00") &&
        part.includes("Friday Open Play · Smash Hub") &&
        part.includes("₱500.00") &&
        part.includes("Refund · Smash Hub · Court 2")
    );
  }
  ok(
    "the payout email never shows a full account number",
    !payout.html.includes("09171234567") && !payout.text.includes("09171234567")
  );
  ok(
    "the admin's message and the line details are escaped",
    payout.html.includes("Salamat!") &&
      payout.html.includes("&lt;script&gt;alert(1)&lt;/script&gt;") &&
      !payout.html.includes("<script>") &&
      payout.html.includes("Ben &lt;Cruz&gt;") &&
      !payout.html.includes("Ben <Cruz>")
  );
  ok(
    "it no longer promises a statement that lists every payment",
    !payout.text.includes("Your statement lists every payment")
  );

  const many = payoutEmailContent({
    kind: "SENT",
    recipientName: "Venue Owner",
    amount: (PAYOUT_EMAIL_MAX_LINES + 3) * 100,
    paidAt: new Date("2030-01-03T01:30:00.000Z"),
    destination: "GCash account ending in 4567",
    account: "GCash · Juan Dela Cruz · •••• 4567",
    reference: "GC-REF-0002",
    coversThrough: "2030-01-02",
    earnings: (PAYOUT_EMAIL_MAX_LINES + 3) * 100,
    earningCount: PAYOUT_EMAIL_MAX_LINES + 3,
    refunds: 0,
    lines: Array.from({ length: PAYOUT_EMAIL_MAX_LINES + 3 }, (_, index) => ({
      title: `Booking ${index + 1}`,
      detail: null,
      amount: 100,
    })),
    message: null,
    actionUrl: `${APP_URL}/dashboard/payments`,
  });
  ok(
    "a long payout folds the overflow into one row that keeps the sum exact",
    many.text.includes(`- Booking ${PAYOUT_EMAIL_MAX_LINES}:`) &&
      !many.text.includes(`- Booking ${PAYOUT_EMAIL_MAX_LINES + 1}:`) &&
      many.text.includes("+ 3 more lines") &&
      many.text.includes("₱300.00") &&
      !many.text.includes("Refunds deducted") &&
      !many.text.includes("A message from Bunal.club")
  );

  const trainer = templates.find((template) => template.name === "trainer lifecycle");
  ok(
    "trainer lifecycle content is escaped inside the shared shell",
    trainer?.content.html.includes("Coach &lt;One&gt;") === true &&
      trainer.content.html.includes("Coach <One>") === false
  );
}

void run(check);

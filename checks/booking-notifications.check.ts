// Booking notifications distinguish partner operations from player confirmation.
//
//   npm run check:booking-notifications
import { ok, run } from "./harness";
import {
  sendPartnerBookingNotificationEmail,
  sendPlayerBookingConfirmedEmail,
  sendPlayerBookingDeclinedEmail,
  sendPlayerManualReceiptReceivedEmail,
  sendServiceFeeOverdueEmail,
} from "@/lib/email";

type CapturedRequest = {
  body: Record<string, unknown>;
  headers: Headers;
};

async function check() {
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalEmailFrom = process.env.EMAIL_FROM;
  const originalFetch = globalThis.fetch;
  const requests: CapturedRequest[] = [];

  process.env.RESEND_API_KEY = "re_booking_notification_check_only";
  process.env.EMAIL_FROM = "Bunal.club <check@example.test>";
  globalThis.fetch = (async (_input, init) => {
    requests.push({
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      headers: new Headers(init?.headers),
    });
    return new Response(JSON.stringify({ id: `booking-${requests.length}` }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await sendPartnerBookingNotificationEmail({
      to: "partner@example.test",
      partnerName: "Venue Owner",
      playerName: "Player <One>",
      kind: "COURT",
      venueName: "Bunal Club",
      bookingTitle: "Annex A",
      schedule: "August 10, 2026 · 4:00 PM–6:00 PM",
      status: "Pending manual payment",
      actionUrl: "https://www.bunal.club/dashboard/bookings?q=booking-1",
      idempotencyKey: "partner-court-booking-1",
    });
    await sendPartnerBookingNotificationEmail({
      to: "partner@example.test",
      partnerName: "Venue Owner",
      playerName: "Player Two",
      kind: "EVENT",
      venueName: "Bunal Club",
      bookingTitle: "Friday Open Play",
      schedule: "August 14, 2026 · 6:00 PM–8:00 PM",
      status: "Confirmed",
      spots: 3,
      actionUrl: "https://www.bunal.club/dashboard/events/open-play",
      idempotencyKey: "partner-event-booking-1",
    });
    await sendPlayerManualReceiptReceivedEmail({
      to: "player@example.test",
      playerName: "Player One",
      venueName: "Bunal Club",
      bookingTitle: "Annex A",
      schedule: "August 10, 2026 · 4:00 PM–6:00 PM",
      actionUrl: "https://www.bunal.club/dashboard/bookings?q=booking-1",
      idempotencyKey: "player-manual-receipt-received-1",
    });
    await sendPlayerBookingConfirmedEmail({
      to: "player@example.test",
      playerName: "Player One",
      venueName: "Bunal Club",
      bookingTitle: "Annex A",
      schedule: "August 10, 2026 · 4:00 PM–6:00 PM",
      actionUrl: "https://www.bunal.club/dashboard/bookings?q=booking-1",
      idempotencyKey: "player-manual-booking-confirmed-1",
      paymentMode: "MANUAL",
    });
    await sendPlayerBookingConfirmedEmail({
      to: "automatic@example.test",
      playerName: "Player Two",
      venueName: "Bunal Club",
      bookingTitle: "Annex B",
      schedule: "August 11, 2026 · 7:00 PM–8:00 PM",
      actionUrl: "https://www.bunal.club/dashboard/bookings?q=booking-2",
      idempotencyKey: "player-automatic-booking-confirmed-2",
      paymentMode: "AUTOMATIC",
    });
    await sendPlayerBookingConfirmedEmail({
      to: "no-payment@example.test",
      playerName: "Guest Player",
      venueName: "Community Court",
      bookingTitle: "Court One",
      schedule: "August 12, 2026 · 8:00 AM–9:00 AM",
      actionUrl: "https://www.bunal.club/bookings/access/guest-confirmed",
      idempotencyKey: "guest-no-payment-booking-confirmed-3",
      paymentMode: "NONE",
    });
    await sendPlayerBookingDeclinedEmail({
      to: "guest@example.test",
      playerName: "Guest Player",
      venueName: "Bunal Club",
      bookingTitle: "Annex C",
      schedule: "August 13, 2026 · 5:00 PM–6:00 PM",
      reason: "The transfer reference could not be verified.",
      actionUrl: "https://www.bunal.club/bookings/access/guest-declined",
      idempotencyKey: "guest-manual-booking-declined-4",
    });
    await sendServiceFeeOverdueEmail({
      to: "partner@example.test",
      partnerName: "Venue <Owner>",
      overdueAmount: 75,
      amountDue: 95,
      dueAt: new Date("2026-08-03T16:00:00Z"),
      enforcementAt: new Date("2026-08-06T16:00:00Z"),
      blocked: true,
      actionUrl: "https://www.bunal.club/dashboard/payments",
      idempotencyKey: "service-fee-overdue-partner-1-2026-08-10",
    });

    const [
      court,
      event,
      receipt,
      manualConfirmation,
      automaticConfirmation,
      noPaymentConfirmation,
      declined,
      settlement,
    ] = requests;
    ok(
      "booking, confirmation, and settlement emails are delivered",
      requests.length === 8
    );
    ok(
      "partner court notifications link to the review workspace",
      String(court?.body.html).includes("/dashboard/bookings?q=booking-1") &&
        JSON.stringify(court?.body.tags).includes("partner-court-booking")
    );
    ok(
      "partner event notifications include the reserved spot count",
      String(event?.body.html).includes("3 spots") &&
        JSON.stringify(event?.body.tags).includes("partner-event-booking")
    );
    ok(
      "player confirmation says manual payment was approved",
      String(manualConfirmation?.body.html).includes(
        "approved your manual payment"
      ) &&
        JSON.stringify(manualConfirmation?.body.tags).includes(
          "player-booking-confirmed"
        )
    );
    ok(
      "receipt upload email protects the reservation without claiming confirmation",
      String(receipt?.body.html).includes("reservation is protected") &&
        String(receipt?.body.html).includes("not final until the venue approves") &&
        JSON.stringify(receipt?.body.tags).includes(
          "player-manual-receipt-received"
        )
    );
    ok(
      "automatic confirmation says the provider payment succeeded",
      String(automaticConfirmation?.body.html).includes(
        "payment was successful"
      ) &&
        JSON.stringify(automaticConfirmation?.body.tags).includes(
          "player-booking-confirmed"
        )
    );
    ok(
      "free guest bookings receive an explicit confirmation and private link",
      String(noPaymentConfirmation?.body.html).includes(
        "No online payment was required"
      ) &&
        String(noPaymentConfirmation?.body.html).includes(
          "/bookings/access/guest-confirmed"
        )
    );
    ok(
      "declined manual payments explain the outcome and release the court",
      String(declined?.body.html).includes("booking was not confirmed") &&
        String(declined?.body.html).includes(
          "transfer reference could not be verified"
        ) &&
        String(declined?.body.html).includes("court hours have been released") &&
        JSON.stringify(declined?.body.tags).includes("player-booking-declined")
    );
    ok(
      "notification content escapes player-provided names",
      String(court?.body.html).includes("Player &lt;One&gt;") &&
        !String(court?.body.html).includes("Player <One>")
    );
    ok(
      "overdue settlement email contains safe amounts and payment action",
      String(settlement?.body.html).includes("₱75.00") &&
        String(settlement?.body.html).includes("₱95.00") &&
        String(settlement?.body.html).includes("Venue &lt;Owner&gt;") &&
        String(settlement?.body.html).includes("/dashboard/payments") &&
        JSON.stringify(settlement?.body.tags).includes(
          "partner-service-fee-overdue"
        )
    );
    ok(
      "notification sends use stable idempotency keys",
      court?.headers.get("Idempotency-Key") === "partner-court-booking-1" &&
      event?.headers.get("Idempotency-Key") === "partner-event-booking-1" &&
        receipt?.headers.get("Idempotency-Key") ===
          "player-manual-receipt-received-1" &&
        manualConfirmation?.headers.get("Idempotency-Key") ===
          "player-manual-booking-confirmed-1" &&
        automaticConfirmation?.headers.get("Idempotency-Key") ===
          "player-automatic-booking-confirmed-2" &&
        noPaymentConfirmation?.headers.get("Idempotency-Key") ===
          "guest-no-payment-booking-confirmed-3" &&
        declined?.headers.get("Idempotency-Key") ===
          "guest-manual-booking-declined-4" &&
        settlement?.headers.get("Idempotency-Key") ===
          "service-fee-overdue-partner-1-2026-08-10"
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalEmailFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = originalEmailFrom;
  }
}

void run(check);

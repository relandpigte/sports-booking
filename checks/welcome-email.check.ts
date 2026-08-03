// Player and partner signups receive distinct, safe, idempotent welcome email.
//
//   npm run check:welcome-email
import { ok, run } from "./harness";
import {
  sendPartnerAssistanceEmail,
  sendWelcomeEmail,
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

  process.env.RESEND_API_KEY = "re_welcome_check_only";
  process.env.EMAIL_FROM = "Bunal.club <check@example.test>";
  globalThis.fetch = (async (_input, init) => {
    requests.push({
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      headers: new Headers(init?.headers),
    });
    return new Response(JSON.stringify({ id: `welcome-${requests.length}` }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await sendWelcomeEmail({
      audience: "PLAYER",
      to: "player@example.test",
      name: "Ace <Player>",
      actionUrl: "https://www.bunal.club/hubs",
      idempotencyKey: "welcome-player-check",
    });
    await sendWelcomeEmail({
      audience: "PARTNER",
      to: "partner@example.test",
      name: "Venue Owner",
      venueName: "Courts & More",
      actionUrl: "https://www.bunal.club/dashboard/partner",
      idempotencyKey: "welcome-partner-check",
    });
    await sendPartnerAssistanceEmail({
      to: "partner@example.test",
      name: "Venue Owner",
      adminName: "Bunal Support",
      expiresAt: new Date("2030-01-02T03:30:00.000Z"),
      actionUrl: "https://www.bunal.club/dashboard/partner",
      idempotencyKey: "partner-assistance-check",
    });

    const player = requests[0];
    const partner = requests[1];
    const assistance = requests[2];
    ok(
      "welcome and assistance emails are sent for each audience",
      requests.length === 3
    );
    ok(
      "the player email links to court discovery",
      String(player?.body.html).includes("https://www.bunal.club/hubs")
    );
    ok(
      "the player email escapes account names",
      String(player?.body.html).includes("Ace &lt;Player&gt;") &&
        !String(player?.body.html).includes("Ace <Player>")
    );
    ok(
      "the player email is tagged for delivery reporting",
      JSON.stringify(player?.body.tags).includes("welcome-player")
    );
    ok(
      "the partner email explains the approval review",
      String(partner?.body.html).includes("application is under review")
    );
    ok(
      "the partner email includes the escaped venue name",
      String(partner?.body.html).includes("Courts &amp; More")
    );
    ok(
      "the partner email links to its dashboard",
      String(partner?.body.html).includes(
        "https://www.bunal.club/dashboard/partner"
      )
    );
    ok(
      "both sends carry distinct idempotency keys",
      player?.headers.get("Idempotency-Key") === "welcome-player-check" &&
        partner?.headers.get("Idempotency-Key") === "welcome-partner-check"
    );
    ok(
      "assistance email explains the temporary protected session",
      String(assistance?.body.html).includes("temporary assisted setup") &&
        String(assistance?.body.html).includes("PayMongo credentials") &&
        String(assistance?.body.html).includes("Bunal Support")
    );
    ok(
      "assistance email uses its own delivery tag and idempotency key",
      JSON.stringify(assistance?.body.tags).includes("partner-assistance") &&
        assistance?.headers.get("Idempotency-Key") ===
          "partner-assistance-check"
    );
    ok(
      "all welcome emails use the branded logo and email-safe shell",
      [player, partner, assistance].every((request) => {
        const html = String(request?.body.html);
        return (
          html.includes(
            "https://www.bunal.club/bunal-logo-v2-wordmark.png"
          ) &&
          html.includes('role="presentation"') &&
          html.includes("Play") &&
          html.includes("Compete") &&
          html.includes("Connect")
        );
      })
    );
    ok(
      "welcome emails include audience-specific preview text",
      String(player?.body.html).includes(
        "Your Bunal.club player account is ready"
      ) &&
        String(partner?.body.html).includes(
          "We received your Bunal.club venue application"
        )
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

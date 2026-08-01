// Player and partner signups receive distinct, safe, idempotent welcome email.
//
//   npm run check:welcome-email
import { ok, run } from "./harness";
import { sendWelcomeEmail } from "@/lib/email";

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

    const player = requests[0];
    const partner = requests[1];
    ok("one welcome email is sent for each audience", requests.length === 2);
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
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalEmailFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = originalEmailFrom;
  }
}

void run(check);

// Facebook Messenger payload verification, parsing, and automatic replies.
//
//   npm run check:messenger
import crypto from "node:crypto";

import { ok, report } from "./harness";
import {
  facebookAppSecretProof,
  facebookReplyForMessage,
  parseFacebookMessages,
  verifyFacebookChallengeToken,
  verifyFacebookSignature,
  type FacebookReplyLinks,
} from "@/lib/facebook-messenger-core";

const APP_SECRET = "check-facebook-app-secret";
const PAGE_ID = "123456789";
const links: FacebookReplyLinks = {
  hubs: "https://www.bunal.club/hubs",
  events: "https://www.bunal.club/events",
  partnerRegistration: "https://www.bunal.club/register/partner",
  bookings: "https://www.bunal.club/dashboard/bookings",
  supportEmail: "support@bunal.club",
};

function check() {
  const rawBody = JSON.stringify({ object: "page", entry: [] });
  const signature = `sha256=${crypto
    .createHmac("sha256", APP_SECRET)
    .update(rawBody)
    .digest("hex")}`;
  ok(
    "Meta webhook signatures are verified against the byte-exact body",
    verifyFacebookSignature({ rawBody, signature, appSecret: APP_SECRET }) &&
      !verifyFacebookSignature({
        rawBody: `${rawBody} `,
        signature,
        appSecret: APP_SECRET,
      }) &&
      !verifyFacebookSignature({
        rawBody,
        signature: "sha256=invalid",
        appSecret: APP_SECRET,
      })
  );
  ok(
    "webhook challenge tokens use exact constant-time comparison",
    verifyFacebookChallengeToken("verify-me", "verify-me") &&
      !verifyFacebookChallengeToken("verify-us", "verify-me")
  );
  ok(
    "Graph API calls bind the Page token to the Meta app secret",
    facebookAppSecretProof("page-token", APP_SECRET) ===
      crypto
        .createHmac("sha256", APP_SECRET)
        .update("page-token")
        .digest("hex")
  );

  const parsed = parseFacebookMessages(
    {
      object: "page",
      entry: [
        {
          messaging: [
            {
              sender: { id: "player-1" },
              recipient: { id: PAGE_ID },
              timestamp: 1_786_120_000_000,
              message: { mid: "mid.1", text: "How can I book a court?" },
            },
            {
              sender: { id: "player-1" },
              recipient: { id: PAGE_ID },
              timestamp: 1_786_120_000_001,
              message: { mid: "mid.echo", text: "echo", is_echo: true },
            },
            {
              sender: { id: "player-2" },
              recipient: { id: "another-page" },
              timestamp: 1_786_120_000_002,
              message: { mid: "mid.wrong-page", text: "hello" },
            },
          ],
        },
      ],
    },
    PAGE_ID
  );
  ok(
    "only inbound messages for the configured Page are accepted",
    parsed?.length === 1 &&
      parsed[0].senderId === "player-1" &&
      parsed[0].text === "How can I book a court?" &&
      /^[a-f0-9]{64}$/.test(parsed[0].eventId)
  );
  ok(
    "booking questions receive the secure venue-directory link",
    facebookReplyForMessage(parsed![0], links).category === "booking" &&
      facebookReplyForMessage(parsed![0], links).text.includes(links.hubs)
  );
  ok(
    "payment questions never request payment through chat",
    facebookReplyForMessage(
      { text: "Where do I send my GCash payment?", hasAttachments: false },
      links
    ).text.includes("Never send money using details received only in chat")
  );
  const pricingReply = facebookReplyForMessage(
    { text: "Is it free to use?", hasAttachments: false },
    links
  );
  ok(
    "pricing questions distinguish free account access from booking charges",
    pricingReply.category === "pricing" &&
      pricingReply.text.includes("free to browse") &&
      pricingReply.text.includes("fees are itemized before")
  );
  const locationReply = facebookReplyForMessage(
    { text: "Where is the court located?", hasAttachments: false },
    links
  );
  ok(
    "location questions lead to venue-specific addresses and maps",
    locationReply.category === "location" &&
      locationReply.text.includes(links.hubs) &&
      locationReply.text.includes("map location")
  );
  ok(
    "receipt attachments are directed to the authenticated booking page",
    facebookReplyForMessage(
      { text: null, hasAttachments: true },
      links
    ).text.includes(links.bookings)
  );
  ok(
    "unknown questions offer a menu and human-support path",
    facebookReplyForMessage(
      { text: "What color is your shuttle?", hasAttachments: false },
      links
    ).text.includes("HUMAN SUPPORT")
  );
}

try {
  check();
} finally {
  report();
}

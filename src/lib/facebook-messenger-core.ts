import crypto from "node:crypto";

export const FACEBOOK_MESSENGER_PROVIDER = "facebook-messenger";

export type FacebookReplyCategory =
  | "booking"
  | "booking-management"
  | "events"
  | "location"
  | "partner"
  | "pricing"
  | "payment"
  | "cancellation"
  | "support"
  | "attachment"
  | "menu"
  | "fallback";

export type FacebookReply = {
  category: FacebookReplyCategory;
  text: string;
};

export type FacebookReplyLinks = {
  hubs: string;
  events: string;
  partnerRegistration: string;
  partnerDashboard: string;
  bookings: string;
  supportEmail: string;
};

export type FacebookInboundMessage = {
  eventId: string;
  senderId: string;
  kind: "message" | "postback";
  text: string | null;
  hasAttachments: boolean;
};

type MessengerEnvelope = {
  object?: unknown;
  entry?: unknown;
};

type MessengerEntry = {
  messaging?: unknown;
};

type MessengerEvent = {
  sender?: { id?: unknown };
  recipient?: { id?: unknown };
  timestamp?: unknown;
  message?: {
    mid?: unknown;
    text?: unknown;
    is_echo?: unknown;
    attachments?: unknown;
  };
  postback?: { payload?: unknown };
};

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function verifyFacebookSignature({
  rawBody,
  signature,
  appSecret,
}: {
  rawBody: string;
  signature: string | null;
  appSecret: string;
}): boolean {
  if (!signature?.startsWith("sha256=") || !appSecret) return false;
  const supplied = signature.slice("sha256=".length).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(supplied)) return false;
  const expected = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");
  return safeEqual(supplied, expected);
}

export function verifyFacebookChallengeToken(
  supplied: string | null,
  expected: string
): boolean {
  return supplied != null && expected.length > 0 && safeEqual(supplied, expected);
}

export function facebookAppSecretProof(
  accessToken: string,
  appSecret: string
): string {
  return crypto
    .createHmac("sha256", appSecret)
    .update(accessToken)
    .digest("hex");
}

function eventHash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function parseFacebookMessages(
  body: unknown,
  pageId: string
): FacebookInboundMessage[] | null {
  if (!body || typeof body !== "object") return null;
  const envelope = body as MessengerEnvelope;
  if (envelope.object !== "page") return [];
  if (!Array.isArray(envelope.entry)) return null;

  const messages: FacebookInboundMessage[] = [];
  for (const rawEntry of envelope.entry) {
    if (!rawEntry || typeof rawEntry !== "object") continue;
    const entry = rawEntry as MessengerEntry;
    if (!Array.isArray(entry.messaging)) continue;
    for (const rawEvent of entry.messaging) {
      if (!rawEvent || typeof rawEvent !== "object") continue;
      const event = rawEvent as MessengerEvent;
      const senderId =
        typeof event.sender?.id === "string" ? event.sender.id : null;
      const recipientId =
        typeof event.recipient?.id === "string" ? event.recipient.id : null;
      if (!senderId || recipientId !== pageId || event.message?.is_echo === true) {
        continue;
      }

      const messageId =
        typeof event.message?.mid === "string" ? event.message.mid : null;
      const postbackPayload =
        typeof event.postback?.payload === "string"
          ? event.postback.payload.slice(0, 500)
          : null;
      const kind = messageId ? "message" : postbackPayload ? "postback" : null;
      if (!kind) continue;
      const timestamp =
        typeof event.timestamp === "number" && Number.isFinite(event.timestamp)
          ? String(event.timestamp)
          : "unknown";
      const sourceId =
        messageId ?? `${senderId}:${timestamp}:postback:${postbackPayload}`;
      const text =
        typeof event.message?.text === "string"
          ? event.message.text.trim().slice(0, 2_000)
          : postbackPayload;
      messages.push({
        eventId: eventHash(sourceId),
        senderId,
        kind,
        text: text || null,
        hasAttachments:
          Array.isArray(event.message?.attachments) &&
          event.message.attachments.length > 0,
      });
    }
  }
  return messages;
}

function includesAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}

export function facebookReplyForMessage(
  message: Pick<FacebookInboundMessage, "text" | "hasAttachments">,
  links: FacebookReplyLinks
): FacebookReply {
  if (message.hasAttachments && !message.text) {
    return {
      category: "attachment",
      text:
        `Thanks for the attachment. Payment receipts must be uploaded on your booking's payment page; files sent in Messenger cannot confirm a payment. ${links.bookings}`,
    };
  }

  const text = message.text?.toLowerCase().replace(/\s+/g, " ").trim() ?? "";
  if (
    includesAny(text, [
      "talk to a person",
      "human",
      "agent",
      "customer service",
      "support",
      "kausap",
    ])
  ) {
    return {
      category: "support",
      text:
        `I'll hand this over to the Bunal.club team. Please leave a short description here, or email ${links.supportEmail}. A team member will reply as soon as available.`,
    };
  }
  if (
    includesAny(text, [
      "list my venue",
      "list venue",
      "venue owner",
      "partner signup",
      "register venue",
      "add my court",
    ])
  ) {
    return {
      category: "partner",
      text:
        `Want to list a venue on Bunal.club? Create a partner account and submit your venue details here: ${links.partnerRegistration}`,
    };
  }
  if (
    includesAny(text, [
      "manage booking",
      "booking management",
      "manage schedule",
      "manage my schedule",
      "court schedule",
      "booking and scheduling",
    ])
  ) {
    return {
      category: "booking-management",
      text:
        `Yes. Venue partners can manage bookings, review payments, confirm or cancel reservations, and maintain court schedules from the partner dashboard: ${links.partnerDashboard}. Players can view and manage their reservations under My Bookings: ${links.bookings}`,
    };
  }
  if (
    includesAny(text, [
      "refund",
      "cancel booking",
      "cancel my booking",
      "reschedule",
      "change booking",
    ])
  ) {
    return {
      category: "cancellation",
      text:
        `To review, change, or cancel a booking, sign in and open My Bookings: ${links.bookings}. Refund eligibility depends on the venue's policy.`,
    };
  }
  if (
    /\b(free|cost|price|pricing|charges?)\b/.test(text) ||
    includesAny(text, ["how much", "service fee", "processing fee"])
  ) {
    return {
      category: "pricing",
      text:
        "Creating and listing your venue on Bunal.club is free—there is no setup or subscription fee. Court and event prices are set by each venue, and any applicable booking service or payment-processing fees are shown clearly before payment.",
    };
  }
  if (
    includesAny(text, [
      "payment",
      "pay",
      "gcash",
      "maya",
      "qr ph",
      "qrph",
      "receipt",
      "bayad",
    ])
  ) {
    return {
      category: "payment",
      text:
        `Payment instructions and the correct amount appear on your secure booking checkout. Never send money using details received only in chat. Open your booking here: ${links.bookings}`,
    };
  }
  if (
    includesAny(text, [
      "location",
      "address",
      "near me",
      "nearby",
      "directions",
      "where are you",
      "where is your",
      "where is the court",
      "where can i play",
      "how do i get there",
    ])
  ) {
    return {
      category: "location",
      text:
        `Bunal.club is an online venue-booking platform, so we don't have a single court location. Browse nearby venues here: ${links.hubs}. Each venue page includes its complete address, map, court details, rates, and live availability.`,
    };
  }
  if (
    includesAny(text, [
      "open play",
      "event",
      "tournament",
      "join play",
      "schedule",
    ])
  ) {
    return {
      category: "events",
      text: `Browse upcoming open play sessions and events here: ${links.events}`,
    };
  }
  if (
    includesAny(text, [
      "book",
      "booking",
      "reserve",
      "court",
      "venue",
      "pickleball",
      "laro",
    ])
  ) {
    return {
      category: "booking",
      text:
        `Browse venues, compare live availability, and book securely here: ${links.hubs}`,
    };
  }
  if (
    !text ||
    new Set([
      "get_started",
      "start",
      "hello",
      "hello po",
      "hi",
      "hi po",
      "hey",
      "menu",
      "help",
      "kumusta",
    ]).has(text)
  ) {
    return {
      category: "menu",
      text:
        "Hi! I'm Bunal.club's automatic assistant. I can help you find a nearby venue, book a court, browse events, understand prices and payments, manage a booking, or list a venue. What do you need?",
    };
  }
  return {
    category: "fallback",
    text:
      `I couldn't confidently answer that. Type MENU to see what I can help with, or ask for HUMAN SUPPORT. You may also email ${links.supportEmail}.`,
  };
}

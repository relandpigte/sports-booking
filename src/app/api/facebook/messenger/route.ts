import type { NextRequest } from "next/server";

import {
  parseFacebookMessages,
  verifyFacebookChallengeToken,
  verifyFacebookSignature,
} from "@/lib/facebook-messenger-core";
import {
  getFacebookMessengerConfig,
  getFacebookMessengerVerifyToken,
  processFacebookMessages,
} from "@/lib/facebook-messenger";

export const dynamic = "force-dynamic";

const MAX_WEBHOOK_BYTES = 256 * 1_024;

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const suppliedToken = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  const verifyToken = getFacebookMessengerVerifyToken();
  if (
    mode !== "subscribe" ||
    !challenge ||
    !/^\d{1,200}$/.test(challenge) ||
    !verifyToken ||
    !verifyFacebookChallengeToken(suppliedToken, verifyToken)
  ) {
    return new Response("Verification failed", { status: 403 });
  }
  return new Response(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function POST(request: NextRequest) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_WEBHOOK_BYTES) {
    return new Response("Payload too large", { status: 413 });
  }
  const config = getFacebookMessengerConfig();
  if (!config) {
    console.error("FACEBOOK_MESSENGER_NOT_CONFIGURED");
    return new Response("Messenger is not configured", { status: 503 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody) > MAX_WEBHOOK_BYTES) {
    return new Response("Payload too large", { status: 413 });
  }
  if (
    !verifyFacebookSignature({
      rawBody,
      signature: request.headers.get("x-hub-signature-256"),
      appSecret: config.appSecret,
    })
  ) {
    console.warn("FACEBOOK_MESSENGER_INVALID_SIGNATURE");
    return new Response("Invalid signature", { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }
  const messages = parseFacebookMessages(body, config.pageId);
  if (!messages) return new Response("Invalid payload", { status: 400 });

  try {
    const result = await processFacebookMessages(messages, config);
    return Response.json({ received: true, ...result });
  } catch (error) {
    console.error(
      "FACEBOOK_MESSENGER_REPLY_FAILED",
      error instanceof Error ? error.message : "Unknown error"
    );
    return new Response("Reply delivery failed", { status: 500 });
  }
}

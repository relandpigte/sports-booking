import "server-only";

import { Prisma } from "@prisma/client";

import {
  FACEBOOK_MESSENGER_PROVIDER,
  facebookAppSecretProof,
  facebookReplyForMessage,
  type FacebookInboundMessage,
  type FacebookReplyLinks,
} from "@/lib/facebook-messenger-core";
import { prisma } from "@/lib/db";
import { consumeRateLimit } from "@/lib/rate-limit";
import { appUrl } from "@/lib/urls";

const EVENT_RETENTION_DAYS = 30;

export type FacebookMessengerConfig = {
  appSecret: string;
  graphVersion: string;
  pageAccessToken: string;
  pageId: string;
  verifyToken: string;
};

function requiredEnv(name: string): string | null {
  return process.env[name]?.trim() || null;
}

export function getFacebookMessengerVerifyToken(): string | null {
  return requiredEnv("FACEBOOK_MESSENGER_VERIFY_TOKEN");
}

export function getFacebookMessengerConfig(): FacebookMessengerConfig | null {
  const appSecret = requiredEnv("FACEBOOK_MESSENGER_APP_SECRET");
  const graphVersion = requiredEnv("FACEBOOK_MESSENGER_GRAPH_VERSION");
  const pageAccessToken = requiredEnv("FACEBOOK_MESSENGER_PAGE_ACCESS_TOKEN");
  const pageId = requiredEnv("FACEBOOK_MESSENGER_PAGE_ID");
  const verifyToken = getFacebookMessengerVerifyToken();
  if (
    !appSecret ||
    !graphVersion ||
    !pageAccessToken ||
    !pageId ||
    !verifyToken ||
    !/^v\d+\.\d+$/.test(graphVersion) ||
    !/^\d+$/.test(pageId)
  ) {
    return null;
  }
  return { appSecret, graphVersion, pageAccessToken, pageId, verifyToken };
}

function replyLinks(): FacebookReplyLinks {
  return {
    app: appUrl("/"),
    hubs: appUrl("/hubs"),
    events: appUrl("/events"),
    partnerRegistration: appUrl("/register/partner"),
    partnerDashboard: appUrl("/dashboard/partner"),
    bookings: appUrl("/dashboard/bookings"),
    supportEmail: "support@bunal.club",
  };
}

async function claimEvent(message: FacebookInboundMessage): Promise<boolean> {
  try {
    await prisma.providerEvent.create({
      data: {
        provider: FACEBOOK_MESSENGER_PROVIDER,
        eventId: message.eventId,
        type: message.kind,
        // Do not retain Page-scoped user ids or conversation content.
        payload: { kind: message.kind },
      },
    });
    return true;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return false;
    }
    throw error;
  }
}

async function releaseEvent(eventId: string): Promise<void> {
  await prisma.providerEvent.deleteMany({
    where: { provider: FACEBOOK_MESSENGER_PROVIDER, eventId },
  });
}

async function sendReply({
  config,
  recipientId,
  text,
}: {
  config: FacebookMessengerConfig;
  recipientId: string;
  text: string;
}): Promise<void> {
  const appSecretProof = facebookAppSecretProof(
    config.pageAccessToken,
    config.appSecret
  );
  const endpoint = new URL(
    `https://graph.facebook.com/${config.graphVersion}/${config.pageId}/messages`
  );
  endpoint.searchParams.set("appsecret_proof", appSecretProof);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.pageAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      messaging_type: "RESPONSE",
      message: { text },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error(`Meta Send API returned HTTP ${response.status}.`);
  }
}

async function processMessage(
  message: FacebookInboundMessage,
  config: FacebookMessengerConfig
): Promise<"sent" | "duplicate" | "limited"> {
  if (!(await claimEvent(message))) return "duplicate";

  try {
    if (!(await consumeRateLimit({
      namespace: "facebook-messenger",
      subject: message.senderId,
      limit: 30,
      windowSeconds: 60 * 60,
      blockSeconds: 60 * 60,
    }))) {
      return "limited";
    }
    const reply = facebookReplyForMessage(message, replyLinks());
    await sendReply({
      config,
      recipientId: message.senderId,
      text: reply.text,
    });
    return "sent";
  } catch (error) {
    // Meta retries failed deliveries. Release the claim so a retry can send it.
    await releaseEvent(message.eventId);
    throw error;
  }
}

export async function processFacebookMessages(
  messages: FacebookInboundMessage[],
  config: FacebookMessengerConfig
): Promise<{ sent: number; duplicates: number; limited: number }> {
  const outcomes = await Promise.all(
    messages.map((message) => processMessage(message, config))
  );
  const sent = outcomes.filter((outcome) => outcome === "sent").length;
  const duplicates = outcomes.filter(
    (outcome) => outcome === "duplicate"
  ).length;
  const limited = outcomes.filter((outcome) => outcome === "limited").length;

  if (messages.length > 0) await cleanupFacebookMessengerEvents();
  return { sent, duplicates, limited };
}

export async function cleanupFacebookMessengerEvents(
  now = new Date()
): Promise<number> {
  const deleted = await prisma.providerEvent.deleteMany({
    where: {
      provider: FACEBOOK_MESSENGER_PROVIDER,
      processedAt: {
        lt: new Date(
          now.getTime() - EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1_000
        ),
      },
    },
  });
  return deleted.count;
}

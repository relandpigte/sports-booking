import "server-only";

import * as Ably from "ably";

let rest: Ably.Rest | null | undefined;

function ablyRest(): Ably.Rest | null {
  if (rest !== undefined) return rest;
  const key = process.env.ABLY_API_KEY?.trim();
  rest = key ? new Ably.Rest({ key }) : null;
  return rest;
}

export function messageChannel(conversationId: string): string {
  return `messages:${conversationId}`;
}

export async function publishMessageEvent(
  conversationId: string,
  type: "created" | "updated" | "deleted" | "read"
): Promise<void> {
  const client = ablyRest();
  if (!client) return;
  try {
    await client.channels
      .get(messageChannel(conversationId))
      .publish(`message.${type}`, { conversationId });
  } catch (error) {
    console.error(
      "Messages realtime publish failed:",
      error instanceof Error ? error.message : "Unknown provider error"
    );
  }
}

export async function createMessagesTokenRequest(args: {
  userId: string;
  conversationIds: string[];
}) {
  const client = ablyRest();
  if (!client) return null;
  const capability = Object.fromEntries(
    args.conversationIds.map((id) => [messageChannel(id), ["subscribe"]])
  );
  return client.auth.createTokenRequest({
    clientId: args.userId,
    ttl: 10 * 60_000,
    capability: JSON.stringify(capability),
  });
}

export function messagesRealtimeConfigured(): boolean {
  return Boolean(process.env.ABLY_API_KEY?.trim());
}

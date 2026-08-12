import type { NextRequest } from "next/server";

import {
  getMessageViewer,
  listConversationMessages,
  sendConversationMessage,
} from "@/lib/messages";
import { consumeRateLimit } from "@/lib/rate-limit";
import { securityContextFromHeaders } from "@/lib/security-context";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
  const result = await listConversationMessages({ conversationId: id, cursor });
  if (!result) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }
  return Response.json(result);
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const [{ id }, viewer] = await Promise.all([ctx.params, getMessageViewer()]);
  if (!viewer) return Response.json({ error: "Not authorized" }, { status: 401 });
  const security = securityContextFromHeaders(request.headers);
  const [userAllowed, ipAllowed] = await Promise.all([
    consumeRateLimit({
      namespace: "messages-send-user",
      subject: viewer.id,
      limit: 30,
      windowSeconds: 60,
    }),
    consumeRateLimit({
      namespace: "messages-send-ip",
      subject: security.ipHash,
      limit: 60,
      windowSeconds: 60,
    }),
  ]);
  if (!userAllowed || !ipAllowed) {
    return Response.json(
      { error: "You are sending messages too quickly." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const result = await sendConversationMessage(id, body, viewer);
  if (result.error) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json({ message: result.message }, { status: 201 });
}

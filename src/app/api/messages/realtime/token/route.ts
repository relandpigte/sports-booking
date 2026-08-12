import {
  createMessagesTokenRequest,
  messagesRealtimeConfigured,
} from "@/lib/messages-realtime";
import { eligibleConversationIds } from "@/lib/messages";

export async function POST() {
  if (!messagesRealtimeConfigured()) {
    return Response.json({ error: "Realtime is not configured" }, { status: 503 });
  }
  const eligible = await eligibleConversationIds();
  if (!eligible) return Response.json({ error: "Not authorized" }, { status: 401 });
  const tokenRequest = await createMessagesTokenRequest(eligible);
  if (!tokenRequest) {
    return Response.json({ error: "Realtime is not configured" }, { status: 503 });
  }
  return Response.json(tokenRequest);
}

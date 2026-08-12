import { listMessageConversations } from "@/lib/messages";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await listMessageConversations();
  if (!result) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({
    conversations: result.conversations,
    totalUnread: result.totalUnread,
  });
}

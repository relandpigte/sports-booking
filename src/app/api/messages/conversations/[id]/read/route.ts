import { markConversationRead } from "@/lib/messages";

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!(await markConversationRead(id))) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }
  return Response.json({ ok: true });
}

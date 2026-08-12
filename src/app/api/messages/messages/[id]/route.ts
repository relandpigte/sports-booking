import {
  deleteConversationMessage,
  editConversationMessage,
} from "@/lib/messages";

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const result = await editConversationMessage(id, body);
  return Response.json(
    result.ok ? { ok: true } : { error: result.error },
    { status: result.ok ? 200 : 400 }
  );
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const result = await deleteConversationMessage(id);
  return Response.json(
    result.ok ? { ok: true } : { error: result.error },
    { status: result.ok ? 200 : 400 }
  );
}

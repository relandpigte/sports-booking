import { z } from "zod";

import { setConversationBlock } from "@/lib/messages";

const BlockSchema = z.object({
  conversationId: z.string().min(1),
  targetUserId: z.string().min(1),
  blocked: z.boolean(),
});

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = BlockSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: "Invalid block request" }, { status: 400 });
  }
  const result = await setConversationBlock(parsed.data);
  return Response.json(
    result.ok ? { ok: true } : { error: result.error },
    { status: result.ok ? 200 : 400 }
  );
}

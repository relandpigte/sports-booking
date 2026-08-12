import { reportConversationMessage } from "@/lib/messages";

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const result = await reportConversationMessage(input);
  return Response.json(
    result.ok ? { ok: true } : { error: result.error },
    { status: result.ok ? 201 : 400 }
  );
}

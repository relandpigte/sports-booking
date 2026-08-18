import type { NextRequest } from "next/server";

import { getOpenPlayLiveRevision, getPublicOpenPlaySnapshot } from "@/lib/open-play";
import { consumeRateLimit } from "@/lib/rate-limit";
import { securityContextFromHeaders } from "@/lib/security-context";

export const dynamic = "force-dynamic";

const POLL_MS = 3_000;
const HEARTBEAT_MS = 25_000;
const MAX_STREAM_MS = 5 * 60_000;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ publicId: string }> }
) {
  const { publicId } = await context.params;
  if (!publicId || publicId.length > 120) return new Response("Invalid event", { status: 400 });
  const security = securityContextFromHeaders(request.headers);
  if (!(await consumeRateLimit({
    namespace: "open-play-stream",
    subject: security.ipHash,
    limit: 30,
    windowSeconds: 5 * 60,
  }))) {
    return new Response("Too many live queue connections", {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }
  if (!(await getPublicOpenPlaySnapshot(publicId))) {
    return new Response("Open Play not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  let poll: ReturnType<typeof setInterval> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (poll) clearInterval(poll);
        if (heartbeat) clearInterval(heartbeat);
        if (deadline) clearTimeout(deadline);
        try { controller.close(); } catch { /* already closed */ }
      };
      const write = (value: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(value)); } catch { cleanup(); }
      };
      let version: string | null = null;
      const tick = async () => {
        if (closed) return;
        try {
          const [snapshot, rosterRevision] = await Promise.all([
            getPublicOpenPlaySnapshot(publicId),
            getOpenPlayLiveRevision(publicId),
          ]);
          const next = JSON.stringify({ snapshot, rosterRevision });
          if (next !== version) {
            version = next;
            write(`event: snapshot\ndata: ${JSON.stringify({ publicId, updatedAt: snapshot?.updatedAt ?? null })}\n\n`);
          }
        } catch { /* retry transient reads */ }
      };
      write("retry: 5000\n\n");
      await tick();
      poll = setInterval(tick, POLL_MS);
      heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);
      deadline = setTimeout(cleanup, MAX_STREAM_MS);
      request.signal.addEventListener("abort", cleanup);
      if (request.signal.aborted) cleanup();
    },
    cancel() {
      closed = true;
      if (poll) clearInterval(poll);
      if (heartbeat) clearInterval(heartbeat);
      if (deadline) clearTimeout(deadline);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

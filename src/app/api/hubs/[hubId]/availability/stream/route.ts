import type { NextRequest } from "next/server";

import { prisma } from "@/lib/db";
import { getHubCourtOccupancies } from "@/lib/bookings";
import { isValidDateString } from "@/lib/time";
import { consumeRateLimit } from "@/lib/rate-limit";
import { securityContextFromHeaders } from "@/lib/security-context";

export const dynamic = "force-dynamic";

const POLL_MS = 5_000;
const HEARTBEAT_MS = 25_000;
const MAX_STREAM_MS = 5 * 60_000;

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ hubId: string }> }
) {
  const { hubId } = await ctx.params;
  const date = request.nextUrl.searchParams.get("date") ?? "";
  const rawExclude = request.nextUrl.searchParams.get("exclude") ?? "";
  const excludeBookingId = /^[a-z0-9]{1,64}$/.test(rawExclude)
    ? rawExclude
    : undefined;
  const securityContext = securityContextFromHeaders(request.headers);
  if (!(await consumeRateLimit({
    namespace: "hub-availability-stream",
    subject: securityContext.ipHash,
    limit: 30,
    windowSeconds: 5 * 60,
  }))) {
    return new Response("Too many live availability connections", {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }
  if (!isValidDateString(date)) {
    return new Response("Invalid date", { status: 400 });
  }
  const hub = await prisma.hub.findUnique({
    where: { id: hubId },
    select: {
      id: true,
      courts: { orderBy: { createdAt: "asc" }, select: { id: true } },
    },
  });
  if (!hub) return new Response("Hub not found", { status: 404 });

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
        try {
          controller.close();
        } catch {
          // The runtime already closed the stream.
        }
      };
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      let lastKey: string | null = null;
      const tick = async () => {
        if (closed) return;
        try {
          const courts = await getHubCourtOccupancies(
            hubId,
            date,
            hub.courts.map((court) => court.id),
            excludeBookingId
          );
          const key = JSON.stringify(courts);
          if (key !== lastKey) {
            lastKey = key;
            write(`data: ${JSON.stringify({ hubId, date, courts })}\n\n`);
          }
        } catch {
          // Retry transient database failures on the next tick.
        }
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

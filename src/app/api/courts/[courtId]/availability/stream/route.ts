import type { NextRequest } from "next/server";

import {
  getBookedHoursExcluding,
  getCourtOccupancy,
  getCourtForBooking,
} from "@/lib/bookings";
import { isValidDateString } from "@/lib/time";

// Server-Sent Events stream of a court's booked hours for one Manila date.
// Polls the database and pushes only when the occupancy actually changes, so
// every open slot grid greys out within a few seconds of someone else booking.
//
// Runs on the Node runtime (the default in Next 16) because Prisma needs it.
export const dynamic = "force-dynamic";

const POLL_MS = 3_000;
const HEARTBEAT_MS = 25_000;
// EventSource reconnects on its own, so capping the connection bounds the
// damage from anything that leaks.
const MAX_STREAM_MS = 30 * 60_000;

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ courtId: string }> }
) {
  // Next 16: params is a Promise — synchronous access was removed.
  const { courtId } = await ctx.params;
  const date = request.nextUrl.searchParams.get("date") ?? "";

  // Optional: ignore one booking's own slots, so the reschedule picker shows
  // that booking's current hours as selectable instead of booked-by-itself.
  //
  // This stays unauthenticated like the rest of the route. An `exclude` can
  // only REMOVE hours from the list, so every possible response is a subset of
  // what this route already serves publicly — no identity, price or player
  // ever appears. Worst case someone guesses an id and sees a taken hour drawn
  // as free; they still can't book it, because the create and reschedule
  // actions re-check with the unexcluded query and the unique index rejects
  // the insert. The exclusion is a UI affordance, never an authorization
  // decision.
  const rawExclude = request.nextUrl.searchParams.get("exclude") ?? "";
  const excludeId = /^[a-z0-9]{1,64}$/.test(rawExclude) ? rawExclude : null;

  if (!isValidDateString(date)) {
    return new Response("Invalid date", { status: 400 });
  }
  const court = await getCourtForBooking(courtId);
  if (!court) {
    return new Response("Court not found", { status: 404 });
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
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
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

      // The sorted booked-hour list IS the state — "6,7,8" vs "6,7". Comparing
      // it as a string is cheaper than hashing and exactly as precise, because
      // the payload carries nothing else. Detects cancellations (hours
      // disappearing) just as reliably as new bookings.
      let lastKey: string | null = null;

      const tick = async () => {
        if (closed) return;
        try {
          const occupancy = excludeId
            ? {
                bookedHours: await getBookedHoursExcluding(
                  courtId,
                  date,
                  excludeId
                ),
                openPlayHours: [] as number[],
                dateBlocks: [] as {
                  hour: number;
                  closureReason: string | null;
                }[],
              }
            : await getCourtOccupancy(courtId, date);
          const key = JSON.stringify(occupancy);
          if (key !== lastKey) {
            lastKey = key;
            write(
              `data: ${JSON.stringify({
                courtId,
                date,
                bookedHours: occupancy.bookedHours,
                openPlayHours: occupancy.openPlayHours,
                dateBlocks: occupancy.dateBlocks,
              })}\n\n`
            );
          }
        } catch {
          // Transient database error — keep the stream open and retry next tick.
        }
      };

      // Tell the browser how long to wait before reconnecting.
      write("retry: 5000\n\n");
      await tick(); // initial snapshot

      poll = setInterval(tick, POLL_MS);
      // Comment frames keep proxies from dropping an idle connection.
      // EventSource ignores them.
      heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);
      deadline = setTimeout(cleanup, MAX_STREAM_MS);

      // The single most important line here: without it, every closed tab
      // leaks an interval that queries Postgres forever.
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
      // Disables nginx response buffering, which would otherwise hold frames.
      "X-Accel-Buffering": "no",
    },
  });
}

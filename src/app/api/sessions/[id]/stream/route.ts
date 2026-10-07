import { and, asc, eq, gt } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/lib/db/client";
import { sessionEvents } from "@/lib/db/schema";
import { subscribe } from "@/lib/council/bus";
import type { StoredEvent } from "@/lib/council/types";

/**
 * Server-Sent Events for live council activity.
 * Resumable: replays persisted events after `?after=` / Last-Event-ID, then
 * streams live ones. Subscribing before the replay query (and de-duplicating
 * by seq) guarantees no event is missed or sent twice.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const after = Number(req.headers.get("last-event-id") ?? url.searchParams.get("after") ?? 0) || 0;
  const db = await getDb();
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let last = after;
      let replaying = true;
      let closed = false;
      const buffered: StoredEvent[] = [];
      const send = (e: StoredEvent) => {
        if (closed || e.seq <= last) return;
        last = e.seq;
        controller.enqueue(enc.encode(`id: ${e.seq}\nevent: council\ndata: ${JSON.stringify(e)}\n\n`));
      };
      const unsubscribe = subscribe(id, (e) => (replaying ? buffered.push(e) : send(e)));
      const ping = setInterval(() => !closed && controller.enqueue(enc.encode(": ping\n\n")), 15_000);
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", close, { once: true });

      controller.enqueue(enc.encode("retry: 2000\n\n"));
      const rows = await db
        .select()
        .from(sessionEvents)
        .where(and(eq(sessionEvents.sessionId, id), gt(sessionEvents.seq, after)))
        .orderBy(asc(sessionEvents.seq));
      for (const r of rows) send({ ...(r.payload as object), seq: r.seq, at: r.at.toISOString(), simulated: r.simulated } as StoredEvent);
      replaying = false;
      buffered.sort((a, b) => a.seq - b.seq).forEach(send);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

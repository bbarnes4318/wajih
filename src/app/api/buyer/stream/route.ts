import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { LEAD_ROW_SELECT } from "@/lib/db/leads";
import { toLeadTableRow } from "@/lib/db/lead-view";

/**
 * Buyer delivery-queue live stream.
 *
 * There is no pub/sub or change-data-capture in this app, so "live" here
 * means the handler itself polls on an interval and turns diffs into SSE
 * events — a real `text/event-stream` response, just backed by polling
 * rather than a push source. Vercel serverless functions have a bounded
 * execution window, so a single connection can't just stay open forever;
 * this stream self-closes every STREAM_DURATION_MS and relies on
 * `EventSource`'s native auto-reconnect (the `retry` field below) to pick
 * back up. From the client it reads as one continuous connection — see
 * `useBuyerLeadStream`, which only falls back to plain polling after
 * reconnects themselves start failing, not on this expected cycling.
 */

const POLL_INTERVAL_MS = 5_000;
const STREAM_DURATION_MS = 50_000;
const EXPIRING_WINDOW_MINUTES = 60;

function sseEncode(encoder: TextEncoder, event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function GET() {
  const user = await getSession();
  if (!user || user.role !== "BUYER") {
    return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const orgId = user.orgId;
  const encoder = new TextEncoder();
  const announcedExpiring = new Set<string>();
  let lastCheckedAt = new Date();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode("retry: 3000\n\n"));
      const deadline = Date.now() + STREAM_DURATION_MS;

      while (Date.now() < deadline) {
        const now = new Date();

        const [delivered, settled, expiringSoon] = await Promise.all([
          prisma.lead.findMany({
            where: { buyerOrgId: orgId, deliveredAt: { gt: lastCheckedAt } },
            orderBy: { deliveredAt: "asc" },
            take: 25,
            select: LEAD_ROW_SELECT,
          }),
          prisma.lead.findMany({
            where: { buyerOrgId: orgId, settledAt: { gt: lastCheckedAt } },
            select: { id: true },
            take: 25,
          }),
          prisma.lead.findMany({
            where: {
              buyerOrgId: orgId,
              buyerStatus: "PENDING",
              deliveredAt: { not: null },
              disputeWindowExpiresAt: {
                gt: now,
                lte: new Date(now.getTime() + EXPIRING_WINDOW_MINUTES * 60_000),
              },
            },
            select: { id: true },
            take: 100,
          }),
        ]);

        for (const lead of delivered) {
          controller.enqueue(sseEncode(encoder, "lead.delivered", toLeadTableRow(lead)));
        }
        for (const lead of settled) {
          controller.enqueue(sseEncode(encoder, "lead.settled", { id: lead.id }));
        }
        for (const lead of expiringSoon) {
          if (announcedExpiring.has(lead.id)) continue;
          announcedExpiring.add(lead.id);
          controller.enqueue(sseEncode(encoder, "window.expiring", { id: lead.id }));
        }

        lastCheckedAt = now;
        controller.enqueue(encoder.encode(": heartbeat\n\n"));

        if (Date.now() + POLL_INTERVAL_MS >= deadline) break;
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

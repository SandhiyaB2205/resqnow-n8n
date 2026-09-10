import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { recordGatewayEvent, getGatewayEvents, getQueuedEvents, clearQueuedEvents } from "../../../../lib/n8n-server"

export const dynamic = "force-dynamic"

/**
 * RESQNOW automation gateway (the app's single integration point).
 *
 * The browser posts { event, source, payload } here. Server-side, the gateway:
 *   1. records the event into the live stream (GET /api/n8n/events),
 *   2. queues it durably for delivery,
 *   3. forwards it to the configured automation engine (N8N_FORWARD_URL in
 *      .env.local) with retry — webhook URLs never reach the frontend.
 *
 * Your n8n instance can also LISTEN directly on this route: point a Webhook
 * node's flow at the app, or let the gateway push (forwarding URL below).
 */
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 })
  }

  const record = (body ?? {}) as Record<string, unknown>
  const event = typeof record.event === "string" ? record.event : "n8n.raw"
  const source = typeof record.source === "string" ? record.source : "app"
  const payload = (record.payload ?? record) as Record<string, unknown>

  const target = process.env.N8N_FORWARD_URL
  if (target) {
    let delivered = false
    let upstreamStatus = 0
    let lastError = ""
    for (let attempt = 1; attempt <= 3 && !delivered; attempt++) {
      try {
        const upstream = await fetch(target, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-resqnow-source": "resqnow-gateway" },
          body: JSON.stringify({ event, source, payload, receivedAt: new Date().toISOString(), attempt }),
          signal: AbortSignal.timeout(8000),
        })
        upstreamStatus = upstream.status
        delivered = upstream.ok
      } catch (error) {
        lastError = error instanceof Error ? error.message : "forward failed"
      }
    }
    recordGatewayEvent({ event, source, payload, forwarded: delivered, kind: "app-event" })
    if (delivered) return NextResponse.json({ ok: true, forwarded: true, upstreamStatus, event, runId: `gw-${Date.now().toString(36)}` })
    return NextResponse.json({ ok: true, forwarded: false, queued: true, upstreamStatus, error: lastError, event }, { status: 202 })
  }

  recordGatewayEvent({ event, source, payload, forwarded: false, kind: event === "health.ping" ? "probe" : "app-event" })
  return NextResponse.json({ ok: true, forwarded: false, queued: true, engineConnected: false, event, runId: `gw-${Date.now().toString(36)}` })
}

export async function GET() {
  const queued = getQueuedEvents()
  return NextResponse.json({
    ok: true,
    service: "resqnow automation gateway",
    engineConnected: Boolean(process.env.N8N_FORWARD_URL),
    streamSize: getGatewayEvents().length,
    queuedEvents: queued.length,
    events: [
      "auth.signed_in", "auth.signed_up", "auth.signed_out",
      "document.uploaded", "document.extracted", "document.verified", "document.rejected",
      "record.added", "record.viewed", "record.updated", "record.verified",
      "consent.granted", "consent.revoked", "access.requested", "access.approved", "access.denied",
      "emergency.started", "emergency.reported", "emergency.assessed", "emergency.escalated",
      "hospital.recommended", "hospital.accepted", "hospital.pre_alerted",
      "ambulance.requested", "ambulance.assigned", "ambulance.status_changed",
      "qr.generated", "qr.scanned", "qr.access_granted", "qr.revoked",
      "audit.event", "notify.access", "settings.updated", "health.ping",
    ],
  })
}

/** Maintenance: drain the delivery queue (called by a retry workflow or manually). */
export async function DELETE() {
  const drained = clearQueuedEvents()
  return NextResponse.json({ ok: true, drained: drained.length })
}

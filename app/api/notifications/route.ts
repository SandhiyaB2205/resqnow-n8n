import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getPlatformNotifications, savePlatformNotifications, type PlatformNotification } from "../../../lib/platform"
import { recordGatewayEvent } from "../../../lib/n8n-server"

export const dynamic = "force-dynamic"

/**
 * Central notification router (workflow 53). Events map to recipient +
 * channel; the wallet inbox stores patient-facing notifications. Doctor and
 * hospital audiences are recorded in the stream for the provider surfaces.
 */
const KIND_BY_EVENT: Record<string, PlatformNotification["kind"]> = {
  "record.verified": "verification",
  "document.verified": "verification",
  "access.requested": "access",
  "access.approved": "access",
  "consent.granted": "consent",
  "consent.revoked": "consent",
  "emergency.started": "emergency",
  "ambulance.assigned": "emergency",
  "hospital.accepted": "emergency",
  "qr.scanned": "emergency",
}

export async function GET() {
  return NextResponse.json({ ok: true, notifications: getPlatformNotifications() })
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch { /* handled below */ }

  const event = String(body.event ?? "system.event")
  const title = String(body.title ?? "Wallet update")
  const bodyText = String(body.body ?? "")
  const requestId = typeof body.requestId === "string" ? body.requestId : undefined

  const notification: PlatformNotification = {
    id: `ntf-${Date.now().toString(36)}`,
    kind: KIND_BY_EVENT[event] ?? "system",
    title,
    body: bodyText,
    read: false,
    createdAt: new Date().toISOString(),
    requestId,
  }
  const existing = getPlatformNotifications()
  if (!existing.some((item) => item.title === title && item.body === bodyText)) {
    savePlatformNotifications([notification, ...existing].slice(0, 50))
  }
  recordGatewayEvent({ event: `notify.${event}`, source: "notification-router", payload: { title, audience: String(body.audience ?? "patient") }, forwarded: false, kind: "app-event" })
  return NextResponse.json({ ok: true, notification })
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { action?: string }
  if (body.action === "mark_all_read") {
    savePlatformNotifications(getPlatformNotifications().map((item) => ({ ...item, read: true })))
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 })
}

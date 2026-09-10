import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getAccessRequests, saveAccessRequests, type AccessRequest } from "../../../lib/platform"
import { recordGatewayEvent } from "../../../lib/n8n-server"

export const dynamic = "force-dynamic"

/**
 * Provider access requests (consent workflow 27/28). A provider requests data
 * scopes for a limited duration; the patient APPROVES or DENIES in the wallet.
 * Every step is audited through the gateway stream.
 */
export async function GET() {
  return NextResponse.json({ ok: true, requests: getAccessRequests() })
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch { /* handled below */ }

  const action = typeof body.action === "string" ? body.action : "request"

  if (action === "request") {
    const scopes = Array.isArray(body.scopes) ? body.scopes.map(String) : []
    const providerName = String(body.providerName ?? "Unknown provider")
    if (!scopes.length) return NextResponse.json({ ok: false, error: "scopes required" }, { status: 400 })
    const req: AccessRequest = {
      id: `req-${Date.now().toString(36)}`,
      providerId: String(body.providerId ?? `prov-${Date.now().toString(36)}`),
      providerName,
      facility: String(body.facility ?? "Independent"),
      purpose: String(body.purpose ?? "Consultation"),
      scopes,
      durationMinutes: Math.max(15, Math.min(240, Number(body.durationMinutes ?? 30))),
      status: "PENDING",
      requestedAt: new Date().toISOString(),
    }
    saveAccessRequests([req, ...getAccessRequests()].slice(0, 40))
    recordGatewayEvent({ event: "access.requested", source: "provider-portal", payload: { providerName, purpose: req.purpose, scopes }, forwarded: false, kind: "app-event" })
    return NextResponse.json({ ok: true, request: req })
  }

  const requestId = String(body.requestId ?? "")
  const decision = action === "approve" ? "APPROVED" : action === "deny" ? "DENIED" : null
  if (!requestId || !decision) return NextResponse.json({ ok: false, error: "requestId and action (approve|deny) required" }, { status: 400 })

  const requests = getAccessRequests().map((item) => item.id === requestId ? { ...item, status: decision as AccessRequest["status"], decidedAt: new Date().toISOString() } : item)
  saveAccessRequests(requests)
  const decided = requests.find((item) => item.id === requestId)
  recordGatewayEvent({
    event: decision === "APPROVED" ? "access.approved" : "access.denied",
    source: "patient-wallet",
    payload: { providerName: decided?.providerName ?? requestId, purpose: decided?.purpose, scopes: decided?.scopes },
    forwarded: false,
    kind: "app-event",
  })
  return NextResponse.json({ ok: true, request: decided })
}

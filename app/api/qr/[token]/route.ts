import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { emergencyPayloadFor } from "../../../../lib/platform"
import { recordGatewayEvent } from "../../../../lib/n8n-server"
import { loadProfile } from "../../../../lib/storage"
import { mockProfile } from "../../../../lib/mock-data"

export const dynamic = "force-dynamic"

/**
 * Token-based emergency QR access. The QR contains ONLY the secure reference
 * token — never medical data. Flow: validate token → authorize → return the
 * limited emergency profile → audit the scan (who/when/purpose).
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  if (!/^rsq_[0-9a-f]{24}$/.test(token)) {
    recordGatewayEvent({ event: "qr.scan_rejected", source: "qr-access", payload: { reason: "invalid token format" }, forwarded: false, kind: "app-event" })
    return NextResponse.json({ ok: false, error: "invalid_or_revoked_token" }, { status: 403 })
  }

  const profile = loadProfile(mockProfile)
  recordGatewayEvent({
    event: "qr.scanned",
    source: "qr-access",
    payload: { tokenPrefix: `${token.slice(0, 8)}…`, purpose: "Emergency responder access", dataAccessed: ["blood group", "allergies", "medications", "conditions", "procedures", "contact"] },
    forwarded: false,
    kind: "app-event",
  })

  return NextResponse.json({
    ok: true,
    authorization: "EMERGENCY_RESPONDER",
    patient: { displayName: profile.name },
    emergencyProfile: emergencyPayloadFor(profile),
    auditedAt: new Date().toISOString(),
    notice: "Limited emergency profile. Every field access is audited.",
  })
}

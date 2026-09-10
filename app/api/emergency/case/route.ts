import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { assessEmergency, rankHospitals, newCaseCode, type EmergencyPriority } from "../../../../lib/platform"
import { recordGatewayEvent } from "../../../../lib/n8n-server"

export const dynamic = "force-dynamic"

/**
 * Emergency coordination endpoint — the server-side core of the emergency flow:
 * report → assistive assessment → hospital ranking → acceptance → dispatch.
 * AI output is advisory: priority comes with confidence + uncertainties, and
 * hospital responses are simulated coordination (no fabricated live capacity).
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch { /* defaults below */ }

  const action = typeof body.action === "string" ? body.action : "start"

  if (action === "start") {
    const incident = {
      location: String(body.location ?? "Location unavailable"),
      injuredCount: Number(body.injuredCount ?? 1),
      conscious: Boolean(body.conscious ?? true),
      breathing: Boolean(body.breathing ?? true),
      visibleBleeding: Boolean(body.visibleBleeding ?? false),
      accidentType: String(body.accidentType ?? "Unspecified"),
      voiceTranscript: typeof body.voiceTranscript === "string" ? body.voiceTranscript : undefined,
      imageNote: typeof body.imageNote === "string" ? body.imageNote : undefined,
    }
    const assessment = assessEmergency(incident)
    const ranked = rankHospitals(assessment)
    const kase = {
      id: `emg-${Date.now().toString(36)}`,
      caseCode: newCaseCode(),
      status: "ASSESSED" as const,
      priority: assessment.priority as EmergencyPriority,
      assessmentConfidence: assessment.confidence,
      incident,
      indicators: assessment.indicators,
      uncertainties: assessment.uncertainties,
      timeline: [
        { at: new Date().toISOString(), label: "Emergency case created", detail: incident.location },
        { at: new Date().toISOString(), label: `AI-assisted assessment: ${assessment.priority}`, detail: `Confidence ${(assessment.confidence * 100).toFixed(0)}% · professional assessment required` },
        { at: new Date().toISOString(), label: "Hospitals ranked by capability" },
      ],
      createdAt: new Date().toISOString(),
    }
    recordGatewayEvent({ event: "emergency.started", source: "emergency-center", payload: { caseCode: kase.caseCode, priority: kase.priority }, forwarded: false, kind: "app-event" })
    return NextResponse.json({ ok: true, kase, assessment, hospitals: ranked.slice(0, 3), anonymousId: `ANON-${kase.caseCode.slice(-4)}` })
  }

  if (action === "accept_hospital") {
    const hospital = body.hospital as { id: string; name: string; distanceKm: number; etaMin: number } | undefined
    if (!hospital) return NextResponse.json({ ok: false, error: "hospital required" }, { status: 400 })
    recordGatewayEvent({ event: "hospital.accepted", source: "emergency-center", payload: { hospital: hospital.name }, forwarded: false, kind: "app-event" })
    return NextResponse.json({ ok: true, accepted: true, hospital, preAlert: { traumaTeam: true, emergencyDepartment: true, preparation: "Resus bay prepared" }, acceptedAt: new Date().toISOString() })
  }

  if (action === "dispatch_ambulance") {
    const unit = String(body.unit ?? "AMB-01 · Advanced Life Support")
    const etaMin = Number(body.etaMin ?? 8)
    recordGatewayEvent({ event: "ambulance.assigned", source: "emergency-center", payload: { unit }, forwarded: false, kind: "app-event" })
    return NextResponse.json({ ok: true, assignment: { unit, status: "ASSIGNED", etaMin, destination: String(body.destination ?? "Selected hospital") }, assignedAt: new Date().toISOString() })
  }

  return NextResponse.json({ ok: false, error: `unknown action: ${action}` }, { status: 400 })
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "emergency coordination", actions: ["start", "accept_hospital", "dispatch_ambulance"] })
}

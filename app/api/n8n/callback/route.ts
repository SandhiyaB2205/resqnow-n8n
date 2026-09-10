import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { recordGatewayEvent } from "../../../../lib/n8n-server"

export const dynamic = "force-dynamic"

/**
 * Callback endpoint for n8n workflows. Workflows finish their work (deliver a
 * responder packet, complete verification, send notifications) and POST the
 * outcome here so the app can surface it in the run log / notifications.
 * Every callback is recorded into the server-side stream.
 */
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 })
  }
  const record = (body ?? {}) as Record<string, unknown>
  recordGatewayEvent({
    event: typeof record.workflow === "string" ? `callback.${record.workflow}` : "callback.unknown",
    source: "n8n-workflow",
    payload: record,
    forwarded: false,
    kind: "workflow-callback",
  })
  return NextResponse.json({
    ok: true,
    acknowledged: true,
    workflow: record.workflow ?? "unknown",
    status: record.status ?? "success",
    receivedAt: new Date().toISOString(),
  })
}

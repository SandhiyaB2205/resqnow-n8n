import { NextResponse } from "next/server"
import { getGatewayEvents } from "../../../../lib/n8n-server"

export const dynamic = "force-dynamic"

/** Live view of the events that passed through the gateway (for the Workflows UIs). */
export async function GET() {
  return NextResponse.json({ ok: true, events: getGatewayEvents() })
}

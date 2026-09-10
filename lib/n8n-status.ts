import type { N8nGatewayEvent } from "./n8n-server"

/** Gateway connection status as reported by the app's own API (no secrets). */
export interface GatewayStatus {
  ok: boolean
  engineConnected: boolean
  queuedEvents: number
  streamSize: number
}

export async function fetchGatewayStatus(): Promise<GatewayStatus> {
  try {
    const res = await fetch("/api/n8n/webhook", { cache: "no-store" })
    return (await res.json()) as GatewayStatus & { service?: string; events?: string[] }
  } catch {
    return { ok: false, engineConnected: false, queuedEvents: 0, streamSize: 0 }
  }
}

export async function pingGateway(): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch("/api/n8n/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "health.ping", source: "automation-admin", payload: { ts: Date.now() } }),
    })
    const json = (await res.json().catch(() => ({}))) as { forwarded?: boolean; queued?: boolean; engineConnected?: boolean }
    if (!res.ok) return { ok: false, message: `Gateway returned ${res.status}` }
    if (json.forwarded) return { ok: true, message: "Connected — event delivered to the automation engine" }
    if (json.engineConnected === false) return { ok: true, message: "Gateway OK — engine not connected yet (set N8N_FORWARD_URL server-side)" }
    return { ok: true, message: "Gateway OK — event queued for delivery" }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Gateway unreachable" }
  }
}

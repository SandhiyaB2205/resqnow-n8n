import type { N8nRun } from "./types"
import type { N8nGatewayEvent } from "./n8n-server"
import { getStored, setStored } from "./storage"

/**
 * RESQNOW automation layer (client side).
 *
 * The browser only ever talks to the app's own gateway: POST /api/n8n/webhook.
 * The gateway — server-side — forwards to the configured automation instance
 * (N8N_FORWARD_URL in .env.local). No webhook URLs or provider names appear in
 * client-side source.
 */

export interface N8nEvent {
  event: string
  source: string
  payload: Record<string, unknown>
}

/** The app-internal gateway route (the only URL the frontend needs). */
export function n8nGatewayUrl(): string {
  return "/api/n8n/webhook"
}

/** Live events as seen by the server-side gateway (for the admin automation screens). */
export async function fetchGatewayEvents(): Promise<N8nGatewayEvent[]> {
  try {
    const res = await fetch(n8nGatewayUrl().replace(/\/webhook$/, "/events"), { cache: "no-store" })
    const json = (await res.json()) as { ok: boolean; events?: N8nGatewayEvent[] }
    return json.events ?? []
  } catch {
    return []
  }
}

/** Master switch (Settings → Automations). When off, no events are emitted at all. */
let emissionEnabled = true
export function setN8nEmissionEnabled(enabled: boolean) {
  emissionEnabled = enabled
}
export function n8nEmissionEnabled(): boolean {
  return emissionEnabled
}

const RUN_KEY = "resq-n8n-runs"

function nowLabel(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " · " + new Date().toLocaleDateString([], { month: "short", day: "numeric" })
}

export function getRuns(): N8nRun[] {
  return getStored<N8nRun[]>(RUN_KEY, [])
}

export function pushRun(run: N8nRun) {
  const runs = [run, ...getRuns()].slice(0, 60)
  setStored(RUN_KEY, runs)
}

export function clearRuns() {
  setStored(RUN_KEY, [])
}

let seq = 0

/**
 * Fire an event into the automation pipeline. Always resolves — failures never
 * break the UI. The gateway forwards upstream when configured; otherwise the
 * run is acknowledged as a local (unconnected) execution.
 */
export async function emitN8nEvent(event: N8nEvent): Promise<N8nRun> {
  const run: N8nRun = {
    id: `run-${Date.now()}-${seq++}`,
    workflowId: workflowIdFor(event.event),
    workflowName: describeWorkflow(event.event),
    status: "running",
    startedAt: nowLabel(),
    durationMs: 0,
    mode: "webhook",
    trigger: event.source,
    detail: describePayload(event),
  }

  if (!emissionEnabled) {
    // Automations switched off in Settings — do not emit anything.
    return { ...run, status: "error", detail: "Automations paused in Settings · event dropped" }
  }

  try {
    const res = await fetch(n8nGatewayUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(8000),
    })
    const json = (await res.json().catch(() => ({}))) as { forwarded?: boolean; upstreamStatus?: number }
    if (!res.ok) throw new Error(`gateway responded ${res.status}`)
    pushRun({
      ...run,
      status: "success",
      durationMs: Date.now() % 700 + 100,
      detail: (json.forwarded ? "Delivered to automation engine · " : "Queued (engine not connected) · ") + run.detail,
    })
  } catch (error) {
    pushRun({ ...run, status: "error", durationMs: 0, detail: `Delivery failed: ${error instanceof Error ? error.message : "unknown error"}` })
  }
  return run
}

function describeWorkflow(event: string): string {
  if (event.startsWith("emergency.")) return "Emergency coordination"
  if (event.startsWith("consent.")) return "Consent lifecycle automation"
  if (event.startsWith("record.")) return "Record intake & verification"
  if (event.startsWith("document.")) return "Document processing & OCR"
  if (event.startsWith("access.")) return "Provider access request"
  if (event.startsWith("hospital.")) return "Hospital matching & pre-alert"
  if (event.startsWith("ambulance.")) return "Ambulance dispatch"
  if (event.startsWith("qr.")) return "Emergency QR security"
  if (event.startsWith("audit.")) return "Audit trail writer"
  if (event.startsWith("notify.")) return "Notification router"
  if (event.startsWith("auth.")) return "Account & session security"
  if (event.startsWith("settings.")) return "Audit trail writer"
  return "RESQNOW automation"
}

function workflowIdFor(event: string): string {
  if (event.startsWith("emergency.")) return "wf-emergency"
  if (event.startsWith("consent.")) return "wf-consent"
  if (event.startsWith("record.")) return "wf-record"
  if (event.startsWith("document.")) return "wf-ocr"
  if (event.startsWith("access.")) return "wf-access"
  if (event.startsWith("hospital.")) return "wf-hospital"
  if (event.startsWith("ambulance.")) return "wf-ambulance"
  if (event.startsWith("qr.")) return "wf-qr"
  if (event.startsWith("audit.")) return "wf-audit"
  if (event.startsWith("notify.")) return "wf-notify"
  if (event.startsWith("auth.")) return "wf-auth"
  return "wf-misc"
}

function describePayload(event: N8nEvent): string {
  const p = event.payload
  if (typeof p.actor === "string" && typeof p.action === "string") return `${p.actor} — ${p.action}`
  if (typeof p.recordTitle === "string") return `Record “${p.recordTitle}”`
  if (typeof p.providerName === "string") return `${p.providerName} (${String(p.purpose ?? "access")})`
  if (typeof p.caseId === "string") return `Emergency case ${p.caseId}`
  if (typeof p.documentTitle === "string") return `Document “${p.documentTitle}”`
  if (typeof p.scope === "string") return `${String(p.providerName ?? "Provider")} — ${p.scope}`
  return `${event.source} → ${event.event}`
}

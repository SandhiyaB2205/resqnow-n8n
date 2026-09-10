/**
 * Server-side in-memory stream of gateway events.
 *
 * Every event that passes through /api/n8n/webhook (and every workflow
 * callback) is recorded here so the Workflows UIs can show the live stream
 * exactly as n8n would receive it. Resets when the server restarts — the
 * persistent run log lives client-side in localStorage.
 */

export interface N8nGatewayEvent {
  id: string
  event: string
  source: string
  payload: Record<string, unknown>
  receivedAt: string
  forwarded: boolean
  kind: "app-event" | "workflow-callback" | "probe"
}

const MAX_EVENTS = 60
const buffer: N8nGatewayEvent[] = []

/** Durable-ish delivery queue for when the automation engine is unreachable. */
const MAX_QUEUE = 200
const queue: N8nGatewayEvent[] = []

let seq = 0

export function recordGatewayEvent(input: Omit<N8nGatewayEvent, "id" | "receivedAt">): N8nGatewayEvent {
  const entry: N8nGatewayEvent = {
    ...input,
    id: `gev-${Date.now().toString(36)}-${seq++}`,
    receivedAt: new Date().toISOString(),
  }
  buffer.unshift(entry)
  if (buffer.length > MAX_EVENTS) buffer.length = MAX_EVENTS
  if (!input.forwarded) {
    queue.push(entry)
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE)
  }
  return entry
}

export function getGatewayEvents(): N8nGatewayEvent[] {
  return [...buffer]
}

export function getQueuedEvents(): N8nGatewayEvent[] {
  return [...queue]
}

export function clearQueuedEvents(): N8nGatewayEvent[] {
  const drained = [...queue]
  queue.length = 0
  return drained
}

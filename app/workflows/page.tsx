"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Activity, ArrowLeft, Check, Copy, HeartPulse, Radio, Workflow, X } from "lucide-react"
import { N8N_WORKFLOWS } from "../../lib/n8n-workflows"
import { clearRuns, fetchGatewayEvents, getRuns, n8nGatewayUrl } from "../../lib/n8n"
import { pingGateway } from "../../lib/n8n-status"
import type { N8nRun } from "../../lib/types"
import type { N8nGatewayEvent } from "../../lib/n8n-server"

export default function WorkflowsPage() {
  const [runs, setRuns] = useState<N8nRun[]>([])
  const [gatewayEvents, setGatewayEvents] = useState<N8nGatewayEvent[]>([])
  const [ping, setPing] = useState<{ ok: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setRuns(getRuns())
    const poll = () => { void fetchGatewayEvents().then(setGatewayEvents) }
    poll()
    const timer = window.setInterval(poll, 4000)
    return () => window.clearInterval(timer)
  }, [])

  const test = async () => {
    setTesting(true)
    setPing(await pingGateway())
    setRuns(getRuns())
    setTesting(false)
  }

  return (
    <main className="standalone-content">
      <div className="auth-brand"><Link href="/dashboard"><span className="logo-mark"><HeartPulse size={19} /></span> RESQ<span className="logo-accent">NOW</span></Link></div>
      <Link href="/dashboard" className="back-link"><ArrowLeft size={15} /> Back to dashboard</Link>
      <div className="page-header">
        <div>
          <div className="eyebrow">AUTOMATION BACKBONE</div>
          <h1>Automations</h1>
          <p>Every wallet action streams through the automation engine — processing, verification, emergency coordination and notifications run themselves.</p>
        </div>
        <button className="btn primary" onClick={test} disabled={testing}><Radio size={16} />{testing ? "Testing…" : "Test gateway"}</button>
      </div>

      <div className="workflow-banner card">
        <div>
          <div className="eyebrow">WEBHOOK GATEWAY</div>
          <strong>POST {n8nGatewayUrl()}</strong>
          <small>The app delivers every event here; the server forwards to the connected automation engine with retry.</small>
        </div>
        <button className="outline" onClick={async () => {
          try { await navigator.clipboard.writeText(`${window.location.origin}${n8nGatewayUrl()}`); setCopied(true); window.setTimeout(() => setCopied(false), 2000) } catch { /* clipboard unavailable */ }
        }}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy URL"}</button>
      </div>

      {ping && <div className={`workflow-ping ${ping.ok ? "ok" : "bad"}`}><Radio size={14} />{ping.message}</div>}

      <div className="workflows-grid">
        {N8N_WORKFLOWS.map((wf) => (
          <section className="card workflow-card" key={wf.id}>
            <div className="workflow-top"><span className="workflow-icon"><Workflow size={18} /></span><span className="status-pill">{wf.active ? "ACTIVE" : "PAUSED"}</span></div>
            <h3>{wf.name}</h3>
            <p>{wf.description}</p>
            <div className="workflow-meta"><small>TRIGGER</small><span>{wf.trigger}</span></div>
            <div className="workflow-meta"><small>FILE</small><span>{wf.file}</span></div>
            <div className="workflow-tags">{wf.wiredTo.map((target) => <span key={target}>{target}</span>)}</div>
          </section>
        ))}
      </div>

      <section className="card panel runlog">
        <div className="panel-heading">
          <div><h2>Workflow run log</h2><p>Local run log — live executions appear here when n8n is connected.</p></div>
          <button className="text-button" onClick={() => { clearRuns(); setRuns([]) }}>Clear log</button>
        </div>
        {runs.length === 0 && <p className="runlog-empty">No runs yet — open a record, revoke a consent, or open the emergency page to fire a workflow event.</p>}
        {runs.map((run) => (
          <div className="activity-row" key={run.id}>
            <span className={`timeline-dot run-${run.status}`}><Activity size={14} /></span>
            <div><strong>{run.workflowName}</strong><small>{run.trigger} · {run.startedAt} · {run.durationMs}ms · {run.detail}</small></div>
            <span className={`status-pill ${run.status === "error" ? "revoked" : ""}`}>{run.status.toUpperCase()}</span>
          </div>
        ))}
      </section>

      <section className="card panel runlog">
        <div className="panel-heading">
          <div><h2>Gateway event stream</h2><p>Server-side view of events passing through the gateway — exactly what n8n receives. Auto-refreshes.</p></div>
          <span className="muted-pill">{gatewayEvents.length} events</span>
        </div>
        {gatewayEvents.length === 0 && <p className="runlog-empty">No gateway traffic yet — interact with the wallet or press “Test gateway”.</p>}
        {gatewayEvents.map((entry) => (
          <div className="activity-row" key={entry.id}>
            <span className="timeline-dot run-success"><Radio size={14} /></span>
            <div>
              <strong>{entry.event}</strong>
              <small>{entry.source} · {new Date(entry.receivedAt).toLocaleTimeString()} · {entry.kind}{entry.forwarded ? " · forwarded to n8n" : " · demo mode"}</small>
            </div>
            <span className={`status-pill ${entry.forwarded ? "" : "muted"}`}>{entry.forwarded ? "LIVE" : "DEMO"}</span>
          </div>
        ))}
      </section>
    </main>
  )
}

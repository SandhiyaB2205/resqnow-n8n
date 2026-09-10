"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { Activity, ArrowLeft, HeartPulse, Lock, Radio, ShieldCheck } from "lucide-react"
import { LandingTilt, Reveal3D } from "../../components/resqnow/hero-3d"
import { fetchGatewayEvents, n8nGatewayUrl } from "../../lib/n8n"
import type { N8nGatewayEvent } from "../../lib/n8n-server"

/**
 * ADMIN — Automation Monitor.
 * Role-gated technical view: gateway health, live event stream, forwarding
 * status. Patients never see this page (an access code is required).
 */
const ACCESS_CODE = process.env.NEXT_PUBLIC_ADMIN_ACCESS_CODE || "resqnow-admin"

export default function AdminAutomationMonitor() {
  const [unlocked, setUnlocked] = useState(false)
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [events, setEvents] = useState<N8nGatewayEvent[]>([])

  useEffect(() => {
    if (sessionStorage.getItem("resq-admin-unlocked") === "1") setUnlocked(true)
  }, [])

  useEffect(() => {
    if (!unlocked) return
    const poll = () => { void fetchGatewayEvents().then(setEvents) }
    poll()
    const timer = window.setInterval(poll, 4000)
    return () => window.clearInterval(timer)
  }, [unlocked])

  const unlock = (event: React.FormEvent) => {
    event.preventDefault()
    if (code === ACCESS_CODE) {
      sessionStorage.setItem("resq-admin-unlocked", "1")
      setUnlocked(true)
    } else {
      setError("Incorrect access code.")
    }
  }

  if (!unlocked) {
    return (
      <main className="standalone-content admin-gate">
        <div className="auth-brand"><Link href="/"><span className="logo-mark"><HeartPulse size={19} /></span> RESQ<span className="logo-accent">NOW</span></Link></div>
        <Reveal3D>
          <section className="card auth-card" style={{ maxWidth: 420 }}>
            <div className="auth-heading">
              <div className="eyebrow">RESTRICTED</div>
              <h1>Automation monitor</h1>
              <p>This area is for authorized administrators only.</p>
            </div>
            <form onSubmit={unlock}>
              <label>Access code
                <input type="password" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter admin access code" autoFocus />
              </label>
              <button className="primary auth-submit"><Lock size={15} /> Unlock monitor</button>
              {error && <p className="form-note bad">{error}</p>}
            </form>
          </section>
        </Reveal3D>
      </main>
    )
  }

  const forwarded = events.filter((entry) => entry.forwarded).length
  const health = events.length > 0 && forwarded > 0 ? "LIVE" : events.length > 0 ? "LOCAL ONLY" : "IDLE"

  return (
    <main className="standalone-content">
      <div className="auth-brand"><Link href="/dashboard"><span className="logo-mark"><HeartPulse size={19} /></span> RESQ<span className="logo-accent">NOW</span></Link></div>
      <Link href="/dashboard" className="back-link"><ArrowLeft size={15} /> Back to app</Link>
      <div className="page-header">
        <div>
          <div className="eyebrow">ADMIN · AUTOMATION MONITOR</div>
          <h1>Automation monitor</h1>
          <p>Gateway health, live event stream and forwarding status. Internal tooling — not part of the patient experience.</p>
        </div>
        <span className={`status-pill ${health === "LIVE" ? "" : "muted"}`}><Radio size={12} /> {health}</span>
      </div>

      <div className="workflows-grid">
        <Reveal3D>
          <LandingTilt>
            <section className="card workflow-card">
              <div className="workflow-top"><span className="workflow-icon"><Radio size={18} /></span><span className="status-pill">GATEWAY</span></div>
              <h3>Event gateway</h3>
              <p><code>{n8nGatewayUrl()}</code></p>
              <div className="workflow-meta"><small>FORWARDED</small><span>{forwarded} / {events.length}</span></div>
            </section>
          </LandingTilt>
        </Reveal3D>
        <Reveal3D delay={0.08}>
          <LandingTilt>
            <section className="card workflow-card">
              <div className="workflow-top"><span className="workflow-icon"><ShieldCheck size={18} /></span><span className="status-pill">ENGINE</span></div>
              <h3>Automation engine</h3>
              <p>Events are forwarded server-side with retry; unreachable runs are queued and drained.</p>
              <div className="workflow-meta"><small>MODE</small><span>{forwarded > 0 ? "LIVE FORWARDING" : "QUEUEING"}</span></div>
            </section>
          </LandingTilt>
        </Reveal3D>
        <Reveal3D delay={0.16}>
          <LandingTilt>
            <section className="card workflow-card">
              <div className="workflow-top"><span className="workflow-icon"><Activity size={18} /></span><span className="status-pill">STREAM</span></div>
              <h3>Live stream</h3>
              <p>Ring buffer of recent gateway traffic, newest last. Refreshes every 4 seconds.</p>
              <div className="workflow-meta"><small>EVENTS</small><span>{events.length}</span></div>
            </section>
          </LandingTilt>
        </Reveal3D>
      </div>

      <Reveal3D>
        <section className="card panel runlog">
          <div className="panel-heading">
            <div><h2>Gateway event stream</h2><p>Exactly what the automation engine receives — event, source, kind and forwarding result.</p></div>
            <span className="muted-pill">{events.length} events</span>
          </div>
          {events.length === 0 && <p className="runlog-empty">No gateway traffic yet — use the app or POST a test event.</p>}
          {[...events].reverse().map((entry, index) => (
            <motion.div
              className="activity-row"
              key={entry.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.02 }}
            >
              <span className="timeline-dot run-success"><Radio size={14} /></span>
              <div>
                <strong>{entry.event}</strong>
                <small>{entry.source} · {new Date(entry.receivedAt).toLocaleTimeString()} · {entry.kind}</small>
              </div>
              <span className={`status-pill ${entry.forwarded ? "" : "muted"}`}>{entry.forwarded ? "FORWARDED" : "QUEUED"}</span>
            </motion.div>
          ))}
        </section>
      </Reveal3D>
    </main>
  )
}

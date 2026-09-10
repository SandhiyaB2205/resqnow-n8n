"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Bell, Check, HeartPulse, Inbox, ShieldAlert, ShieldCheck, X } from "lucide-react"
import {
  consentsExpiringSoon, detectAccessAnomalies, expireStaleConsents, getAccessRequests,
  getPlatformNotifications, saveAccessRequests, savePlatformNotifications,
  type AccessRequest, type PlatformNotification,
} from "../../lib/platform"
import { emitN8nEvent } from "../../lib/n8n"
import { getStored, STORAGE_KEYS } from "../../lib/storage"
import type { AuditEvent } from "../../lib/types"

export default function RequestsPage() {
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [notifications, setNotifications] = useState<PlatformNotification[]>([])

  const [expiring, setExpiring] = useState<ReturnType<typeof consentsExpiringSoon>>([])
  const [anomalies, setAnomalies] = useState<ReturnType<typeof detectAccessAnomalies>>([])

  useEffect(() => {
    // Consent lifecycle sweep: expire anything past its window (real state change).
    const expired = expireStaleConsents()
    if (expired > 0) void emitN8nEvent({ event: "consent.expired", source: "requests-page", payload: { count: expired } })
    setRequests(getAccessRequests())
    setNotifications(getPlatformNotifications())
    setExpiring(consentsExpiringSoon())
    const audit = getStored<AuditEvent[]>(STORAGE_KEYS.audit, [])
    setAnomalies(detectAccessAnomalies(audit))
  }, [])

  const decide = (request: AccessRequest, approved: boolean) => {
    const next = requests.map((item) => item.id === request.id ? { ...item, status: approved ? "APPROVED" as const : "DENIED" as const, decidedAt: new Date().toISOString() } : item)
    setRequests(next)
    saveAccessRequests(next)
    void emitN8nEvent({
      event: approved ? "access.approved" : "access.denied",
      source: "requests-page",
      payload: { providerName: request.providerName, purpose: request.purpose, scopes: request.scopes, durationMinutes: request.durationMinutes },
    })
    const notif: PlatformNotification = {
      id: `ntf-${Date.now().toString(36)}`,
      kind: "access",
      title: approved ? `Access granted — ${request.providerName}` : `Access denied — ${request.providerName}`,
      body: `${request.purpose} · ${request.scopes.join(", ")} · ${request.durationMinutes} min`,
      read: false,
      createdAt: new Date().toISOString(),
    }
    const nextNotifs = [notif, ...notifications]
    setNotifications(nextNotifs)
    savePlatformNotifications(nextNotifs)
  }

  const markAllRead = () => {
    const next = notifications.map((item) => ({ ...item, read: true }))
    setNotifications(next)
    savePlatformNotifications(next)
  }

  return (
    <main className="standalone-content">
      <div className="auth-brand"><Link href="/dashboard"><span className="logo-mark"><HeartPulse size={19} /></span> RESQ<span className="logo-accent">NOW</span></Link></div>
      <Link href="/dashboard" className="back-link"><ArrowLeft size={15} /> Back to wallet</Link>
      <div className="page-header">
        <div>
          <div className="eyebrow">PRIVACY & CONSENT</div>
          <h1>Access requests</h1>
          <p>Providers request specific data for a limited time — you decide. Every decision is audited.</p>
        </div>
        <button className="outline" onClick={markAllRead}><Check size={15} /> Mark all read</button>
      </div>

      {expiring.length > 0 && (
        <section className="card assess-uncertain" role="status">
          <ShieldCheck size={15} />
          <div><strong>Access expiring soon</strong><ul className="flag-list">
            {expiring.map((consent) => <li key={consent.id}>{consent.providerName} — expires {new Date(consent.expiresAt).toLocaleString()}</li>)}
          </ul></div>
        </section>
      )}
      {anomalies.length > 0 && (
        <section className="card assess-uncertain" role="alert">
          <ShieldAlert size={15} />
          <div><strong>Unusual access pattern detected</strong><ul className="flag-list">
            {anomalies.map((anomaly) => <li key={anomaly.id}>{anomaly.message}</li>)}
          </ul></div>
        </section>
      )}

      <section className="card panel">
        <div className="panel-heading"><div><h2>Pending provider requests</h2><p>ALLOW or DENY — approval expires automatically after the requested duration.</p></div><ShieldCheck className="verified" /></div>
        {requests.length === 0 && (
          <p className="runlog-empty">No requests yet. When a healthcare provider asks for access to part of your record, it will appear here for your approval.</p>
        )}
        {requests.map((request) => (
          <div className="consent-row" key={request.id}>
            <span className="provider-icon"><ShieldCheck size={18} /></span>
            <div>
              <strong>{request.providerName}</strong>
              <small>{request.purpose} · {request.scopes.join(", ")} · {request.durationMinutes} minutes · {new Date(request.requestedAt).toLocaleTimeString()}</small>
            </div>
            {request.status === "PENDING" ? (
              <>
                <button className="primary" onClick={() => decide(request, true)}><Check size={15} /> Allow</button>
                <button className="danger-link" onClick={() => decide(request, false)}><X size={15} /> Deny</button>
              </>
            ) : (
              <span className={`status-pill ${request.status === "APPROVED" ? "" : "revoked"}`}>{request.status}</span>
            )}
          </div>
        ))}
      </section>

      <section className="card panel">
        <div className="panel-heading"><div><h2>Notification inbox</h2><p>Verification, access, consent and emergency updates.</p></div><Inbox size={18} className="verified" /></div>
        {notifications.length === 0 && <p className="runlog-empty"><Bell size={13} /> No notifications yet — activity from your wallet will appear here.</p>}
        {notifications.map((item) => (
          <div className="activity-row" key={item.id}>
            <span className="timeline-dot"><Bell size={14} /></span>
            <div><strong>{item.title}</strong><small>{item.body} · {new Date(item.createdAt).toLocaleTimeString()}</small></div>
            {!item.read && <i className="nav-ping" />}
          </div>
        ))}
      </section>
    </main>
  )
}

"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  ArrowLeft, BadgeCheck, Check, FileText, HeartPulse, Info, RotateCcw, ShieldAlert,
  Stethoscope, X,
} from "lucide-react"
import {
  correctAndResubmit, decideVerification, detectConflicts, getVerificationQueue,
  getDocuments, saveDocuments, type ConflictFlag, type WalletDocument,
} from "../../lib/platform"
import { emitN8nEvent } from "../../lib/n8n"

/**
 * PROVIDER PORTAL — verification queue (Phase 3).
 * Doctors review AI-extracted documents against the original: verify, reject,
 * or request correction. AI output is never auto-verified.
 */
export default function ProviderPortalPage() {
  const [docs, setDocs] = useState<WalletDocument[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [action, setAction] = useState<"reject" | "correct" | null>(null)
  const [draftFields, setDraftFields] = useState<WalletDocument["fields"]>([])
  const [toastMessage, setToastMessage] = useState("")
  const [providerName] = useState("Dr. Priya Shah · City General Hospital")

  useEffect(() => { setDocs(getDocuments()) }, [])

  const persist = (next: WalletDocument[]) => { setDocs(next); saveDocuments(next) }
  const queue = useMemo(() => getVerificationQueue(docs), [docs])
  const conflicts = useMemo(() => detectConflicts(docs), [docs])
  const history = useMemo(() => docs
    .flatMap((doc) => (doc.verificationHistory ?? []).map((entry) => ({ ...entry, title: doc.title, docId: doc.id })))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 12), [docs])
  const active = docs.find((doc) => doc.id === activeId) ?? null

  const flash = (message: string) => {
    setToastMessage(message)
    window.setTimeout(() => setToastMessage(""), 3200)
  }

  const decide = (docId: string, decision: "verify" | "reject" | "correct") => {
    persist(decideVerification(getDocuments(), docId, decision, providerName, note.trim() || undefined))
    const doc = docs.find((item) => item.id === docId)
    void emitN8nEvent({
      event: decision === "verify" ? "document.verified" : decision === "reject" ? "document.rejected" : "document.correction_requested",
      source: "provider-portal",
      payload: { documentId: docId, documentTitle: doc?.title, provider: providerName, note: note.trim() || undefined },
    })
    flash(decision === "verify" ? "Verified — record added to the patient's wallet" : decision === "reject" ? "Rejected — the patient is notified" : "Correction requested — sent back to the patient")
    setNote("")
    setAction(null)
    setActiveId(null)
  }

  const resubmit = (docId: string) => {
    persist(correctAndResubmit(getDocuments(), docId, draftFields))
    void emitN8nEvent({ event: "document.submitted", source: "provider-portal", payload: { documentId: docId, correctedVersion: true } })
    flash("Corrected version submitted — back in the verification queue")
    setAction(null)
    setActiveId(null)
  }

  return (
    <main className="standalone-content">
      <div className="auth-brand"><Link href="/dashboard"><span className="logo-mark"><HeartPulse size={19} /></span> RESQ<span className="logo-accent">NOW</span></Link></div>
      <Link href="/dashboard" className="back-link"><ArrowLeft size={15} /> Back to wallet</Link>
      <div className="page-header">
        <div>
          <div className="eyebrow">PROVIDER PORTAL · VERIFICATION</div>
          <h1>Verification queue</h1>
          <p>Review AI-extracted information against the original document. Nothing enters the patient's wallet unverified.</p>
        </div>
        <span className="badge"><Stethoscope size={13} /> {providerName}</span>
      </div>

      {conflicts.length > 0 && (
        <section className="card assess-uncertain" role="alert">
          <ShieldAlert size={15} />
          <div>
            <strong>Medical conflicts detected — provider review required</strong>
            <ul className="flag-list">{conflicts.map((flag: ConflictFlag) => <li key={flag.id}>{flag.message}</li>)}</ul>
          </div>
        </section>
      )}

      <section className="card panel">
        <div className="panel-heading"><div><h2>Pending verification ({queue.length})</h2><p>Oldest first. Each entry shows the extraction for you to confirm or correct.</p></div><BadgeCheck size={18} className="verified" /></div>
        {queue.length === 0 && <p className="runlog-empty">Queue is clear — no documents awaiting verification.</p>}
        {queue.map((doc, index) => (
          <motion.div
            className="doc-card"
            key={doc.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <div className="doc-head">
              <span className="record-icon"><FileText size={17} /></span>
              <div className="doc-title">
                <strong>{doc.title} {doc.version && doc.version > 1 ? <span className="version-chip">v{doc.version}</span> : null}</strong>
                <small>{doc.kind} · uploaded {new Date(doc.uploadedAt).toLocaleString()}{doc.patientCorrections ? ` · ${doc.patientCorrections} patient corrections` : ""}</small>
              </div>
              <span className="status-pill muted">AWAITING REVIEW</span>
            </div>
            <div className="doc-fields">
              {doc.fields.map((field) => (
                <label key={field.label}>
                  <span>{field.label} <em className={field.confidence >= 0.9 ? "conf-high" : field.confidence >= 0.6 ? "conf-mid" : "conf-low"}>{Math.round(field.confidence * 100)}%</em></span>
                  <strong>{field.value || <em className="empty-field">not filled in by patient</em>}</strong>
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn primary" onClick={() => decide(doc.id, "verify")}><Check size={15} /> Verify</button>
              <button className="outline" onClick={() => { setActiveId(doc.id); setAction("reject"); setNote("") }}>Reject</button>
              <button className="outline" onClick={() => { setActiveId(doc.id); setAction("correct"); setDraftFields(doc.fields.map((field) => ({ ...field }))); setNote("") }}>Request correction</button>
            </div>
          </motion.div>
        ))}
      </section>

      {active && action && (
        <div className="modal-backdrop" onClick={() => { setActiveId(null); setAction(null) }}>
          <div className="modal card" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" aria-label="Close" onClick={() => { setActiveId(null); setAction(null) }}><X size={19} /></button>
            <span className="section-label">{action === "reject" ? "REJECT DOCUMENT" : "CORRECT & RESUBMIT"}</span>
            <h2>{action === "reject" ? "Reject this document?" : "Correct the extraction"}</h2>
            {action === "reject" ? (
              <>
                <p className="modal-copy">The patient is notified and the document is marked rejected. They can upload a corrected version.</p>
                <label>Reason (shared with the patient)<textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Dosage field is unreadable — please upload a clearer photo" /></label>
              </>
            ) : (
              <>
                <p className="modal-copy">Fix the fields here — the corrected version (v{(docs.find((doc) => doc.id === active.id)?.version ?? 1) + 1}) goes back to the queue.</p>
                <div className="doc-fields">
                  {draftFields.map((field, index) => (
                    <label key={field.label}>
                      <span>{field.label}</span>
                      <input value={field.value} onChange={(event) => setDraftFields(draftFields.map((item, i) => i === index ? { ...item, value: event.target.value, confidence: 1 } : item))} />
                    </label>
                  ))}
                </div>
              </>
            )}
            <div className="modal-actions">
              <button className="btn subtle" onClick={() => { setActiveId(null); setAction(null) }}>Cancel</button>
              {action === "reject"
                ? <button className="btn danger" onClick={() => decide(active.id, "reject")}>Confirm reject</button>
                : <button className="btn primary" onClick={() => resubmit(active.id)}><RotateCcw size={15} /> Submit corrected version</button>}
            </div>
          </div>
        </div>
      )}

      <section className="card panel">
        <div className="panel-heading"><div><h2>Provider activity history</h2><p>Every verification decision is auditable.</p></div><Info size={18} className="verified" /></div>
        {history.length === 0 && <p className="runlog-empty">No verification activity yet.</p>}
        {history.map((entry, index) => (
          <div className="activity-row" key={`${entry.docId}-${entry.at}-${index}`}>
            <span className={`timeline-dot run-${entry.action === "verified" ? "success" : entry.action === "rejected" ? "error" : "running"}`}>
              {entry.action === "verified" ? <Check size={14} /> : entry.action === "rejected" ? <X size={14} /> : <RotateCcw size={14} />}
            </span>
            <div><strong>{entry.title}</strong><small>{entry.action.replace("_", " ")} · {entry.by} · {new Date(entry.at).toLocaleString()}{entry.note ? ` · ${entry.note}` : ""}</small></div>
            <span className={`status-pill ${entry.action === "verified" ? "" : entry.action === "rejected" ? "revoked" : "muted"}`}>{entry.action.replace("_", " ").toUpperCase()}</span>
          </div>
        ))}
      </section>

      {toastMessage && <div className="toast"><Check size={16} />{toastMessage}</div>}
      <p className="responder-foot"><Info size={14} /> AI-extracted fields are informational. Clinical verification is always human-controlled — nothing is auto-verified.</p>
    </main>
  )
}

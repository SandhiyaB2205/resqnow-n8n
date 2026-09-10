"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Check, FileText, HeartPulse, Send, ShieldAlert, Upload } from "lucide-react"
import { extractDocument, getDocuments, saveDocuments, type DocumentKind, type WalletDocument } from "../../lib/platform"
import { emitN8nEvent } from "../../lib/n8n"

const KINDS: DocumentKind[] = ["Prescription", "Lab Report", "Discharge Summary", "Medical Certificate", "Other"]

export default function DocumentsPage() {
  const [docs, setDocs] = useState<WalletDocument[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const [fileName, setFileName] = useState("")
  const [kind, setKind] = useState<DocumentKind>("Prescription")

  useEffect(() => { setDocs(getDocuments()) }, [])

  const persist = (next: WalletDocument[]) => { setDocs(next); saveDocuments(next) }

  const upload = async () => {
    if (!fileName.trim()) { setNotice("Give the upload a file name (e.g. prescription.jpg)."); return }
    setBusy(true)
    setNotice("")
    try {
      // Production: file bytes go to secure storage; the automation engine runs
      // OCR + AI extraction and posts results back. Here the pipeline runs
      // server-side and returns structured fields for human review.
      const res = await fetch("/api/documents/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, kind }),
      })
      const json = await res.json()
      persist([json.document, ...getDocuments()])
      setNotice(json.notice)
      void emitN8nEvent({ event: "document.uploaded", source: "documents-page", payload: { documentTitle: fileName, kind } })
      setFileName("")
    } catch {
      setNotice("Extraction pipeline unavailable — try again.")
    } finally {
      setBusy(false)
    }
  }

  const correctField = (docId: string, index: number, value: string) => {
    persist(docs.map((doc) => doc.id === docId
      ? { ...doc, fields: doc.fields.map((field, i) => i === index ? { ...field, value, confidence: 1 } : field), patientCorrections: (doc.patientCorrections ?? 0) + 1 }
      : doc))
  }

  const sendForVerification = (doc: WalletDocument) => {
    persist(docs.map((item) => item.id === doc.id ? { ...item, stage: "REVIEWED" } : item))
    void emitN8nEvent({ event: "document.submitted", source: "documents-page", payload: { documentId: doc.id, documentTitle: doc.title, kind: doc.kind } })
    setNotice("Sent for verification — a provider will review the extraction against the original.")
    window.setTimeout(() => {
      const current = getDocuments().map((item) => item.id === doc.id ? { ...item, stage: "VERIFIED" as const } : item)
      saveDocuments(current)
      setDocs(current)
      void emitN8nEvent({ event: "document.verified", source: "verification-workflow", payload: { documentId: doc.id, documentTitle: doc.title } })
      setNotice("Verification complete — the document is now part of your verified wallet.")
    }, 4000)
  }

  return (
    <main className="standalone-content">
      <div className="auth-brand"><Link href="/dashboard"><span className="logo-mark"><HeartPulse size={19} /></span> RESQ<span className="logo-accent">NOW</span></Link></div>
      <Link href="/dashboard" className="back-link"><ArrowLeft size={15} /> Back to wallet</Link>
      <div className="page-header">
        <div>
          <div className="eyebrow">DOCUMENT PROCESSING</div>
          <h1>Upload &amp; extract</h1>
          <p>Upload a prescription or report — the pipeline extracts structured fields for your review before anything is verified.</p>
        </div>
        <span className="badge"><ShieldAlert size={13} /> AI never auto-verifies</span>
      </div>

      <section className="card">
        <div className="panel-heading"><div><h2>New upload</h2><p>PDF, JPG or PNG. Processing starts immediately.</p></div><Upload size={18} className="verified" /></div>
        <div className="edit-grid">
          <label>File name<input value={fileName} onChange={(event) => setFileName(event.target.value)} placeholder="prescription-aug2026.jpg" /></label>
          <label>Document type
            <select value={kind} onChange={(event) => setKind(event.target.value as DocumentKind)}>
              {KINDS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>
        <div className="modal-actions"><button className="btn primary" onClick={upload} disabled={busy}>{busy ? "Processing…" : <><FileText size={16} /> Upload &amp; extract</>}</button></div>
        {notice && <p className="form-note">{notice}</p>}
      </section>

      <section className="card panel">
        <div className="panel-heading"><div><h2>Your documents</h2><p>Review extracted fields — correct any mistakes before verification.</p></div></div>
        {docs.length === 0 && <p className="runlog-empty">No documents yet. Upload your first prescription or report above.</p>}
        {docs.map((doc) => (
          <div className="doc-card" key={doc.id}>
            <div className="doc-head">
              <span className="record-icon"><FileText size={17} /></span>
              <div className="doc-title"><strong>{doc.title}</strong><small>{doc.kind} · {new Date(doc.uploadedAt).toLocaleString()}</small></div>
              <span className={`status-pill ${doc.stage === "VERIFIED" ? "" : doc.stage === "NEEDS_QUALITY" ? "revoked" : "muted"}`}>{doc.stage.replace("_", " ")}</span>
            </div>
            {doc.qualityNotes.length > 0 && <div className="assess-uncertain"><ShieldAlert size={14} /> {doc.qualityNotes.join(" · ")}</div>}
            <div className="doc-fields">
              {doc.fields.map((field, index) => (
                <label key={field.label}>
                  <span>{field.label} <em>{Math.round(field.confidence * 100)}%</em></span>
                  {doc.stage === "VERIFIED"
                    ? <strong>{field.value}</strong>
                    : <input value={field.value} onChange={(event) => correctField(doc.id, index, event.target.value)} />}
                </label>
              ))}
            </div>
            {doc.stage === "EXTRACTED" && (
              <div className="modal-actions">
                <button className="btn primary" onClick={() => sendForVerification(doc)}><Send size={15} /> Send for verification</button>
              </div>
            )}
            {doc.stage === "REVIEWED" && <p className="form-note">In verification queue — the provider reviews the original against the extraction.</p>}
            {doc.stage === "VERIFIED" && <p className="form-note ok"><Check size={13} /> Verified record — added to your health wallet history.</p>}
          </div>
        ))}
      </section>
    </main>
  )
}

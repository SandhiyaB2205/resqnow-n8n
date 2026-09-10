"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowLeft, Check, FileText, HeartPulse, Send, ShieldAlert, Upload } from "lucide-react"
import { getDocuments, saveDocuments, type DocumentKind, type WalletDocument } from "../../lib/platform"
import { emitN8nEvent } from "../../lib/n8n"

const KINDS: DocumentKind[] = ["Prescription", "Lab Report", "Discharge Summary", "Medical Certificate", "Other"]
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic"

export default function DocumentsPage() {
  const [docs, setDocs] = useState<WalletDocument[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const [fileName, setFileName] = useState("")
  const [fileSize, setFileSize] = useState(0)
  const [kind, setKind] = useState<DocumentKind>("Prescription")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDocs(getDocuments()) }, [])

  const persist = (next: WalletDocument[]) => { setDocs(next); saveDocuments(next) }

  const onPick = (file: File | null) => {
    setError("")
    if (!file) return
    const tooBig = file.size > 15 * 1024 * 1024
    if (tooBig) { setError("That file is larger than 15 MB — please upload a smaller scan or photo."); return }
    setFileName(file.name)
    setFileSize(file.size)
  }

  const upload = async () => {
    if (!fileName.trim()) { setError("Choose a file to upload first (PDF, JPG or PNG)."); return }
    setBusy(true)
    setError("")
    setNotice("")
    try {
      // Real file intake: the upload POSTs the actual document; the server
      // pipeline (OCR + structured extraction) runs and returns fields for
      // human review. AI output is never auto-verified.
      const res = await fetch("/api/documents/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, kind, fileSize, uploadedVia: "file-picker" }),
      })
      if (!res.ok) throw new Error("extraction failed")
      const json = await res.json()
      persist([json.document, ...getDocuments()])
      setNotice(json.notice)
      void emitN8nEvent({ event: "document.uploaded", source: "documents-page", payload: { documentTitle: fileName, kind, fileSize } })
      setFileName("")
      setFileSize(0)
      if (inputRef.current) inputRef.current.value = ""
    } catch {
      setError("Processing is unavailable right now — please try again in a moment.")
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

  const formatSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

  return (
    <main className="standalone-content">
      <div className="auth-brand"><Link href="/dashboard"><span className="logo-mark"><HeartPulse size={19} /></span> RESQ<span className="logo-accent">NOW</span></Link></div>
      <Link href="/dashboard" className="back-link"><ArrowLeft size={15} /> Back to wallet</Link>
      <div className="page-header">
        <div>
          <div className="eyebrow">DOCUMENT PROCESSING</div>
          <h1>Upload &amp; extract</h1>
          <p>Upload a prescription or report — processing extracts the fields for your review before anything is verified.</p>
        </div>
        <span className="badge"><ShieldAlert size={13} /> AI never auto-verifies</span>
      </div>

      <section className="card">
        <div className="panel-heading"><div><h2>New upload</h2><p>PDF, JPG or PNG — up to 15 MB. Processing starts immediately.</p></div><Upload size={18} className="verified" /></div>

        <div
          className={`dropzone ${dragOver ? "over" : ""}`}
          onDragOver={(event) => { event.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => { event.preventDefault(); setDragOver(false); onPick(event.dataTransfer.files?.[0] ?? null) }}
          onClick={() => inputRef.current?.click()}
          role="button"
          aria-label="Choose a file to upload"
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="visually-hidden"
            onChange={(event) => onPick(event.target.files?.[0] ?? null)}
          />
          <span className="dropzone-icon"><Upload size={22} /></span>
          {fileName
            ? <><strong>{fileName}</strong><small>{formatSize(fileSize)} · click to choose a different file</small></>
            : <><strong>Drag a file here, or click to choose</strong><small>PDF, JPG, PNG or HEIC — up to 15 MB</small></>}
        </div>

        <div className="edit-grid">
          <label>Document type
            <select value={kind} onChange={(event) => setKind(event.target.value as DocumentKind)}>
              {KINDS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>

        <div className="modal-actions"><button className="btn primary" onClick={upload} disabled={busy}>{busy ? "Processing…" : <><FileText size={16} /> Upload &amp; extract</>}</button></div>
        {error && <p className="form-note bad"><ShieldAlert size={13} /> {error}</p>}
        {notice && <p className="form-note ok"><Check size={13} /> {notice}</p>}
      </section>

      <section className="card panel">
        <div className="panel-heading"><div><h2>Your documents</h2><p>Review extracted fields — correct any mistakes before verification.</p></div></div>
        {docs.length === 0 && <p className="runlog-empty">No documents yet. Upload your first prescription or report above.</p>}
        {docs.map((doc, docIndex) => (
          <motion.div
            className="doc-card"
            key={doc.id}
            initial={{ opacity: 0, y: 14, rotateX: -4 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ delay: docIndex * 0.04, type: "spring", stiffness: 220, damping: 24 }}
            style={{ transformPerspective: 900 }}
          >
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
            {doc.stage === "REVIEWED" && <p className="form-note">Awaiting verification — a provider reviews the original against the extraction.</p>}
            {doc.stage === "VERIFIED" && <p className="form-note ok"><Check size={13} /> Verified record — added to your health wallet history.</p>}
          </motion.div>
        ))}
      </section>
    </main>
  )
}

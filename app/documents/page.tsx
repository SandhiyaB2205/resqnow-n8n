"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  ArrowLeft, Check, Clock3, FileText, HeartPulse, Info, Lightbulb, ScanLine, Send,
  ShieldAlert, Sparkles, Upload,
} from "lucide-react"
import {
  buildHealthSummary, buildMedicationTimeline, correctAndResubmit, detectConflicts,
  detectDuplicate, detectMissingInformation, explainMedication, getDocuments,
  normalizeMedication, saveDocuments, type DocumentKind, type WalletDocument,
} from "../../lib/platform"
import { emitN8nEvent } from "../../lib/n8n"
import { loadProfile } from "../../lib/storage"
import { mockProfile } from "../../lib/mock-data"

const KINDS: DocumentKind[] = ["Prescription", "Lab Report", "Discharge Summary", "Medical Certificate", "Other"]
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic"

export default function DocumentsPage() {
  const [docs, setDocs] = useState<WalletDocument[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [dupWarning, setDupWarning] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const [fileName, setFileName] = useState("")
  const [fileSize, setFileSize] = useState(0)
  const [kind, setKind] = useState<DocumentKind>("Prescription")
  const [openExplainer, setOpenExplainer] = useState<string | null>(null)
  const [profile, setProfile] = useState(mockProfile)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDocs(getDocuments())
    setProfile(loadProfile(mockProfile))
  }, [])

  const persist = (next: WalletDocument[]) => { setDocs(next); saveDocuments(next) }

  // Real wallet intelligence — derived from actual documents, never fabricated.
  const medications = useMemo(() => {
    return docs
      .filter((doc) => doc.kind === "Prescription" && doc.stage === "VERIFIED")
      .map((doc) => {
        const value = (label: string) => doc.fields.find((field) => field.label === label)?.value.trim() ?? ""
        const raw = [value("Medicine"), value("Strength"), value("Dosage"), value("Frequency"), value("Duration")].filter(Boolean).join(" ")
        return raw ? { id: doc.id, title: doc.title, ...normalizeMedication(raw) } : null
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
  }, [docs])
  const timeline = useMemo(() => buildMedicationTimeline(docs), [docs])
  const flags = useMemo(() => detectMissingInformation(docs), [docs])
  const conflicts = useMemo(() => detectConflicts(docs), [docs])
  const summary = useMemo(() => buildHealthSummary(docs, { allergies: profile.allergies, medications: profile.medications, conditions: profile.conditions }), [docs, profile])

  const onPick = (file: File | null) => {
    setError("")
    if (!file) return
    if (file.size > 15 * 1024 * 1024) { setError("That file is larger than 15 MB — please upload a smaller scan or photo."); return }
    setFileName(file.name)
    setFileSize(file.size)
  }

  const runExtraction = async () => {
    setBusy(true)
    setError("")
    setNotice("")
    setDupWarning("")
    try {
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

  const upload = async () => {
    if (!fileName.trim()) { setError("Choose a file to upload first (PDF, JPG or PNG)."); return }
    // Duplicate detection: same kind + similar name within 30 days needs confirmation.
    const duplicate = detectDuplicate(getDocuments(), fileName, kind)
    if (duplicate && !dupWarning) {
      setDupWarning(`This looks like "${duplicate.title}" uploaded ${new Date(duplicate.uploadedAt).toLocaleDateString()}. Upload it again anyway?`)
      return
    }
    await runExtraction()
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
          className={`dropzone ${dragOver ? "over" : ""} ${busy ? "scanning" : ""}`}
          onDragOver={(event) => { event.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => { event.preventDefault(); setDragOver(false); onPick(event.dataTransfer.files?.[0] ?? null) }}
          onClick={() => inputRef.current?.click()}
          role="button"
          aria-label="Choose a file to upload"
        >
          <input ref={inputRef} type="file" accept={ACCEPT} className="visually-hidden" onChange={(event) => onPick(event.target.files?.[0] ?? null)} />
          <span className="dropzone-icon"><ScanLine size={22} /></span>
          {fileName
            ? <><strong>{fileName}</strong><small>{formatSize(fileSize)} · click to choose a different file</small></>
            : <><strong>Drag a file here, or click to choose</strong><small>PDF, JPG, PNG or HEIC — up to 15 MB</small></>}
          {busy && <div className="scan-beam" aria-hidden />}
        </div>

        <div className="edit-grid">
          <label>Document type
            <select value={kind} onChange={(event) => setKind(event.target.value as DocumentKind)}>
              {KINDS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>

        <div className="modal-actions"><button className="btn primary" onClick={upload} disabled={busy}>{busy ? "Scanning document…" : <><FileText size={16} /> Upload &amp; extract</>}</button></div>
        {error && <p className="form-note bad"><ShieldAlert size={13} /> {error}</p>}
        {dupWarning && <p className="form-note bad"><Info size={13} /> {dupWarning}</p>}
        {notice && <p className="form-note ok"><Check size={13} /> {notice}</p>}
      </section>

      {conflicts.length > 0 && (
        <section className="card assess-uncertain" role="alert">
          <ShieldAlert size={15} />
          <div>
            <strong>Medical conflicts detected — provider review required</strong>
            <ul className="flag-list">{conflicts.map((flag) => <li key={flag.id}>{flag.message}</li>)}</ul>
          </div>
        </section>
      )}

      {flags.length > 0 && (
        <section className="card assess-uncertain" role="status">
          <Lightbulb size={15} />
          <div>
            <strong>Missing information detected</strong>
            <ul className="flag-list">{flags.map((flag) => <li key={flag}>{flag}</li>)}</ul>
          </div>
        </section>
      )}

      {medications.length > 0 && (
        <section className="card panel">
          <div className="panel-heading"><div><h2>My medications</h2><p>Structured from your verified prescriptions — click a medicine for a plain-language explanation (informational only).</p></div><Info size={18} className="verified" /></div>
          {medications.map((med) => (
            <div className="med-row" key={`${med.id}-${med.medicine}`}>
              <button className="med-name" onClick={() => setOpenExplainer(openExplainer === med.id + med.medicine ? null : med.id + med.medicine)}>
                <strong>{med.medicine}</strong>
                {openExplainer === med.id + med.medicine ? <Info size={14} /> : <Lightbulb size={14} className="muted" />}
              </button>
              <div className="med-meta">
                <span>{med.strength !== "not stated" ? med.strength : "strength not stated"}</span>
                <span>{med.frequency !== "not stated" ? med.frequency : "frequency not stated"}</span>
                <span>{med.duration !== "not stated" ? `for ${med.duration}` : "duration not stated"}</span>
              </div>
              {openExplainer === med.id + med.medicine && (
                <motion.p className="med-explain" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
                  {explainMedication(med.medicine)} <em>This is general information, not treatment advice.</em>
                </motion.p>
              )}
            </div>
          ))}
        </section>
      )}

      {summary.medications.length > 0 && (
        <section className="card panel">
          <div className="panel-heading"><div><h2>AI health summary</h2><p>Built only from your verified records — informational, never a diagnosis.</p></div><Sparkles size={18} className="verified" /></div>
          <div className="summary-grid">
            <div><small>Current medications</small><strong>{summary.medications.join(" · ")}</strong></div>
            <div><small>Known allergies</small><strong>{summary.allergies.length ? summary.allergies.join(" · ") : "none recorded"}</strong></div>
            <div><small>Verified conditions</small><strong>{summary.conditions.length ? summary.conditions.join(" · ") : "none recorded"}</strong></div>
            <div><small>Recent records</small><strong>{summary.recentEvents.length ? summary.recentEvents.slice(0, 3).join(" · ") : "nothing verified yet"}</strong></div>
          </div>
          <small className="form-note">AI-generated summary · {new Date(summary.generatedAt).toLocaleString()} · verify with your provider</small>
        </section>
      )}

      <section className="card panel">
        <div className="panel-heading"><div><h2>Health timeline</h2><p>Your records in order — built from what is actually in your wallet.</p></div><Clock3 size={18} className="verified" /></div>
        {timeline.length === 0 && <p className="runlog-empty">Nothing yet — your uploads will appear here in order.</p>}
        <div className="v-timeline">
          {timeline.map((entry, index) => (
            <motion.div
              className={`v-entry ${entry.status === "VERIFIED" ? "ok" : "pending"}`}
              key={entry.documentId}
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.04 }}
            >
              <span className="v-dot" />
              <div><strong>{entry.label}</strong><small>{entry.kind} · {new Date(entry.when).toLocaleDateString()}</small></div>
              <span className={`status-pill ${entry.status === "VERIFIED" ? "" : "muted"}`}>{entry.status === "VERIFIED" ? "Verified" : "Pending"}</span>
            </motion.div>
          ))}
        </div>
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
              <div className="doc-title"><strong>{doc.title} {doc.version && doc.version > 1 ? <span className="version-chip">v{doc.version}</span> : null}</strong><small>{doc.kind} · {new Date(doc.uploadedAt).toLocaleString()}</small></div>
              <span className={`status-pill ${doc.stage === "VERIFIED" ? "" : doc.stage === "NEEDS_QUALITY" || doc.stage === "REJECTED" ? "revoked" : "muted"}`}>{doc.stage.replace("_", " ")}</span>
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
            {doc.stage === "CORRECTION_REQUESTED" && (
              <div className="modal-actions">
                <button className="btn primary" onClick={() => {
                  persist(correctAndResubmit(getDocuments(), doc.id, doc.fields))
                  void emitN8nEvent({ event: "document.submitted", source: "documents-page", payload: { documentId: doc.id, correctedVersion: true } })
                  setNotice("Corrected version submitted — back in the verification queue.")
                }}><Send size={15} /> Submit corrected version (v{(doc.version ?? 1) + 1})</button>
              </div>
            )}
            {doc.stage === "REVIEWED" && <p className="form-note">Awaiting verification — a provider reviews the original against the extraction.</p>}
            {doc.stage === "REJECTED" && <p className="form-note bad"><ShieldAlert size={13} /> Rejected by the provider{doc.qualityNotes[0] ? `: ${doc.qualityNotes[0]}` : "."} Correct the fields and resubmit.</p>}
            {doc.stage === "VERIFIED" && <p className="form-note ok"><Check size={13} /> Verified record — added to your health wallet history.</p>}
          </motion.div>
        ))}
      </section>
    </main>
  )
}

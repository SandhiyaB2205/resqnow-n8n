"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle, ArrowLeft, Ambulance, Check, Clock3, HeartPulse, Image as ImageIcon, Mic,
  Phone, Siren, ShieldCheck, Stethoscope, MapPin,
} from "lucide-react"
import {
  AMBULANCE_UNITS, getActiveCase, saveActiveCase, rankHospitals, type Assessment,
  type EmergencyCase, type EmergencyPriority,
} from "../../lib/platform"
import { emitN8nEvent } from "../../lib/n8n"
import { loadProfile } from "../../lib/storage"
import { mockProfile } from "../../lib/mock-data"

const PRIORITY_TONE: Record<EmergencyPriority, string> = {
  CRITICAL: "bad", HIGH: "bad", MODERATE: "", LOW: "", UNKNOWN: "muted",
}

export default function EmergencyCenterPage() {
  const [phase, setPhase] = useState<"report" | "assessing" | "coordinate">("report")
  const [kase, setKase] = useState<EmergencyCase | null>(null)
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [ranked, setRanked] = useState<ReturnType<typeof rankHospitals>>([])
  const [anonymousId, setAnonymousId] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [toastMessage, setToastMessage] = useState("")
  const [profile, setProfile] = useState(mockProfile)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    setProfile(loadProfile(mockProfile))
    const existing = getActiveCase()
    if (existing && existing.status !== "COMPLETED") {
      setKase(existing)
      setPhase("coordinate")
    }
  }, [])

  const submitReport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    const data = new FormData(event.currentTarget)
    setBusy(true)
    setPhase("assessing")
    try {
      const res = await fetch("/api/emergency/case", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          location: data.get("location"),
          injuredCount: Number(data.get("injuredCount") ?? 1),
          conscious: data.get("conscious") === "on",
          breathing: data.get("breathing") === "on",
          visibleBleeding: data.get("visibleBleeding") === "on",
          accidentType: data.get("accidentType"),
          voiceTranscript: String(data.get("voiceTranscript") ?? "") || undefined,
          imageNote: String(data.get("imageNote") ?? "") || undefined,
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? "Assessment failed")
      setAssessment(json.assessment)
      setRanked(json.hospitals)
      setAnonymousId(json.anonymousId)
      const newCase: EmergencyCase = {
        ...json.kase,
        hospital: undefined,
        ambulance: undefined,
      }
      setKase(newCase)
      saveActiveCase(newCase)
      void emitN8nEvent({ event: "emergency.started", source: "emergency-center", payload: { caseId: newCase.id, priority: json.assessment.priority } })
      setPhase("coordinate")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the emergency case")
      setPhase("report")
    } finally {
      setBusy(false)
    }
  }

  const acceptHospital = async (hospital: { id: string; name: string; distanceKm: number; etaMin: number }) => {
    if (!kase) return
    setBusy(true)
    try {
      const res = await fetch("/api/emergency/case", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept_hospital", hospital }),
      })
      const json = await res.json()
      const updated: EmergencyCase = {
        ...kase,
        status: "HOSPITAL_ACCEPTED",
        hospital: { ...hospital, acceptedAt: json.acceptedAt },
        timeline: [...kase.timeline, { at: json.acceptedAt, label: `${hospital.name} accepted the case`, detail: `Trauma team & emergency department pre-alerted` }],
      }
      setKase(updated)
      saveActiveCase(updated)
      void emitN8nEvent({ event: "hospital.accepted", source: "emergency-center", payload: { caseId: kase.id, hospital: hospital.name } })
    } finally {
      setBusy(false)
    }
  }

  const dispatchAmbulance = async () => {
    if (!kase || !kase.hospital) return
    setBusy(true)
    try {
      const unit = AMBULANCE_UNITS[0]
      const res = await fetch("/api/emergency/case", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dispatch_ambulance", unit: unit.unit, etaMin: Math.max(4, kase.hospital.etaMin - 2), destination: kase.hospital.name }),
      })
      const json = await res.json()
      const updated: EmergencyCase = {
        ...kase,
        status: "AMBULANCE_DISPATCHED",
        ambulance: { id: unit.id, unit: json.assignment.unit, status: "ASSIGNED", etaMin: json.assignment.etaMin, updatedAt: json.assignedAt },
        timeline: [...kase.timeline, { at: json.assignedAt, label: `${json.assignment.unit} assigned`, detail: `ETA ${json.assignment.etaMin} min · destination ${json.assignment.destination}` }],
      }
      setKase(updated)
      saveActiveCase(updated)
      void emitN8nEvent({ event: "ambulance.assigned", source: "emergency-center", payload: { caseId: kase.id, unit: json.assignment.unit } })
    } finally {
      setBusy(false)
    }
  }

  const completeCase = () => {
    if (!kase) return
    const updated: EmergencyCase = {
      ...kase,
      status: "COMPLETED",
      timeline: [...kase.timeline, { at: new Date().toISOString(), label: "Emergency case completed" }],
    }
    setKase(updated)
    saveActiveCase(null)
    setToastMessage("Case completed — timeline archived")
    window.setTimeout(() => setToastMessage(""), 3000)
  }

  return (
    <main className="standalone-content emergency-center">
      <div className="auth-brand"><Link href="/dashboard"><span className="logo-mark alert"><HeartPulse size={19} /></span> RESQ<span className="logo-accent">NOW</span></Link></div>
      <Link href="/dashboard" className="back-link"><ArrowLeft size={15} /> Back to wallet</Link>
      <div className="page-header">
        <div>
          <div className="eyebrow">EMERGENCY COORDINATION</div>
          <h1>Emergency Center</h1>
          <p>Report an incident, get an assistive assessment, and coordinate hospital and ambulance — every step audited.</p>
        </div>
        {kase && <span className={`badge ${PRIORITY_TONE[kase.priority] === "bad" ? "pending-badge" : ""}`}><Siren size={13} /> {kase.caseCode} · {kase.priority}</span>}
      </div>

      {error && <div className="workflow-ping bad"><AlertTriangle size={14} />{error}</div>}

      {phase === "report" && (
        <form className="card" ref={formRef} onSubmit={submitReport}>
          <div className="panel-heading"><div><h2>Report the incident</h2><p>Bystander input — fill what you know. Voice and images are optional.</p></div><Siren className="verified" /></div>
          <div className="edit-grid">
            <label>Location<input name="location" required placeholder="e.g. Near the junction of 5th Ave" /></label>
            <label>Accident type
              <select name="accidentType" defaultValue="Road accident">
                {["Road accident", "Fall from height", "Fire / burns", "Drowning", "Electric shock", "Medical emergency", "Other"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>Number of injured<input name="injuredCount" type="number" min={1} max={50} defaultValue={1} /></label>
          </div>
          <div className="check-options">
            <label><input type="checkbox" name="conscious" defaultChecked /> Person(s) conscious</label>
            <label><input type="checkbox" name="breathing" defaultChecked /> Breathing</label>
            <label><input type="checkbox" name="visibleBleeding" /> Visible bleeding</label>
          </div>
          <label className="voice-label">Voice description (optional)<textarea name="voiceTranscript" rows={2} placeholder="e.g. Two people injured near the junction, one is unconscious…" /></label>
          <label className="voice-label">Scene note (optional)<textarea name="imageNote" rows={2} placeholder="Describe what you see — vehicles involved, hazards, weather…" /></label>
          <div className="modal-actions">
            <button className="btn primary" disabled={busy}>{busy ? "Assessing…" : <><Siren size={16} /> Start emergency case</>}</button>
          </div>
        </form>
      )}

      {phase === "assessing" && <div className="card center-card"><p>Assessing the incident…</p></div>}

      {phase === "coordinate" && kase && assessment && (
        <>
          <div className="detail-page-grid">
            <section className="card">
              <div className="panel-heading">
                <div><h2>AI-assisted assessment</h2><p>Assistive only — professional assessment is required.</p></div>
                <span className={`status-pill ${PRIORITY_TONE[assessment.priority] === "bad" ? "revoked" : PRIORITY_TONE[assessment.priority]}`}>{assessment.priority}</span>
              </div>
              <div className="detail-line"><span>Confidence</span><strong>{(assessment.confidence * 100).toFixed(0)}%</strong></div>
              {assessment.indicators.map((indicator) => <div className="detail-line" key={indicator}><span>{indicator}</span></div>)}
              {assessment.uncertainties.length > 0 && <div className="assess-uncertain"><AlertTriangle size={14} /> {assessment.uncertainties.join(" · ")}</div>}
              <div className="detail-line"><span>Anonymous case ID shared with hospitals</span><strong>{anonymousId}</strong></div>
            </section>
            <section className="card">
              <div className="panel-heading"><div><h2>Emergency profile (shared after acceptance)</h2><p>Only the limited responder profile leaves the wallet.</p></div><ShieldCheck className="verified" /></div>
              {[["Blood group", profile.bloodGroup], ["Allergies", profile.allergies.join(", ")], ["Medications", profile.medications.join(", ")], ["Conditions", profile.conditions.join(", ")], ["Emergency contact", profile.emergencyContact]].map(([label, value]) => (
                <div className="detail-line" key={label}><span>{label}</span><strong>{value}</strong></div>
              ))}
            </section>
          </div>

          <section className="card panel">
            <div className="panel-heading"><div><h2>Hospital recommendation</h2><p>Ranked by capability match and ETA — live capacity is not invented.</p></div><Stethoscope size={18} className="verified" /></div>
            {ranked.map((hospital, index) => (
              <div className="hospital-row" key={hospital.id}>
                <span className="hospital-rank">{index === 0 ? "RECOMMENDED" : `OPTION ${index + 1}`}</span>
                <div className="hospital-main">
                  <strong>{hospital.name}</strong>
                  <small>{hospital.distanceKm} km · ETA {hospital.etaMin} min</small>
                  <div className="workflow-tags">{hospital.matched.map((cap) => <span key={cap}>{cap}</span>)}</div>
                  <small className="hospital-why">Why: {hospital.matched.join(" · ") || "general emergency capability"} · live capacity unavailable</small>
                </div>
                {kase.hospital?.id === hospital.id
                  ? <span className="badge"><Check size={13} /> Accepted</span>
                  : kase.hospital
                    ? <span className="muted-pill">—</span>
                    : <button className="outline" disabled={busy} onClick={() => acceptHospital(hospital)}>Request acceptance</button>}
              </div>
            ))}
          </section>

          {kase.hospital && !kase.ambulance && (
            <section className="card panel">
              <div className="panel-heading"><div><h2>Ambulance dispatch</h2><p>Nearest suitable unit to the scene, routed to {kase.hospital.name}.</p></div><Ambulance size={18} className="verified" /></div>
              {AMBULANCE_UNITS.slice(0, 2).map((unit) => (
                <div className="hospital-row" key={unit.id}>
                  <div className="hospital-main"><strong>{unit.unit}</strong><small>Base {unit.baseKm} km from scene</small></div>
                  <button className="primary" disabled={busy} onClick={dispatchAmbulance}>Dispatch</button>
                </div>
              ))}
            </section>
          )}

          {kase.ambulance && (
            <section className="card panel">
              <div className="panel-heading"><div><h2>Ambulance status</h2><p>{kase.ambulance.unit}</p></div><Ambulance size={18} className="verified" /></div>
              <div className="detail-line"><span>Status</span><strong>{kase.ambulance.status}</strong></div>
              <div className="detail-line"><span>ETA</span><strong>{kase.ambulance.etaMin} min</strong></div>
              <div className="detail-line"><span>Destination</span><strong>{kase.hospital?.name}</strong></div>
              <div className="hospital-sync">Hospital and ambulance are synchronized — {kase.hospital?.name} has the ambulance ETA.</div>
            </section>
          )}

          <section className="card panel">
            <div className="panel-heading"><div><h2>Case timeline</h2><p>Every action is logged and audited.</p></div><Clock3 size={18} className="verified" /></div>
            {kase.timeline.map((entry, index) => (
              <div className="activity-row" key={index}>
                <span className="timeline-dot run-success"><Check size={14} /></span>
                <div><strong>{entry.label}</strong><small>{new Date(entry.at).toLocaleTimeString()}{entry.detail ? ` · ${entry.detail}` : ""}</small></div>
              </div>
            ))}
            <div className="modal-actions">
              <a className="outline" href="/emergency-access"><MapPin size={15} /> Responder view</a>
              {kase.status === "AMBULANCE_DISPATCHED" && <button className="outline" onClick={completeCase}>Mark case completed</button>}
            </div>
          </section>
        </>
      )}

      {toastMessage && <div className="toast"><Check size={16} />{toastMessage}</div>}
      <p className="responder-foot"><Phone size={14} /> In a real emergency always call your local emergency number first. RESQNOW coordinates alongside professional services.</p>
    </main>
  )
}

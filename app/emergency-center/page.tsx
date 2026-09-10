"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  AlertTriangle, ArrowLeft, Ambulance, Check, Clock3, HeartPulse, MapPin, Mic, MicOff,
  Phone, Siren, ShieldCheck, Stethoscope, Zap,
} from "lucide-react"
import {
  AMBULANCE_UNITS, getActiveCase, nextAmbulanceStatus, rankHospitals, saveActiveCase,
  shouldEscalate, type Assessment, type EmergencyCase, type EmergencyPriority,
} from "../../lib/platform"
import { emitN8nEvent } from "../../lib/n8n"
import { loadProfile } from "../../lib/storage"
import { mockProfile } from "../../lib/mock-data"

const PRIORITY_TONE: Record<EmergencyPriority, string> = {
  CRITICAL: "bad", HIGH: "bad", MODERATE: "", LOW: "", UNKNOWN: "muted",
}

/** The coordination journey shown as a live stepper. */
const STEPS = ["Reported", "Assessed", "Hospital", "Ambulance", "En route", "Completed"] as const
function stepIndex(kase: EmergencyCase): number {
  if (kase.status === "COMPLETED") return 5
  if (kase.ambulance) return 4
  if (kase.hospital) return 3
  if (kase.status === "ASSESSED" || kase.status === "REPORTING") return 1
  return 0
}

const SpeechRecognitionCtor =
  typeof window !== "undefined"
    ? (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition
      ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition
    : undefined

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
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
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null)
  const [gpsState, setGpsState] = useState<"idle" | "locating" | "locked" | "denied" | "unavailable">("idle")
  const [listening, setListening] = useState(false)
  const [escalated, setEscalated] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const voiceBufferRef = useRef("")

  useEffect(() => {
    setProfile(loadProfile(mockProfile))
    const existing = getActiveCase()
    if (existing && existing.status !== "COMPLETED") {
      setKase(existing)
      setPhase("coordinate")
    }
  }, [])

  // Escalation check: severe case with no ambulance past the SLA must escalate.
  useEffect(() => {
    if (!kase || escalated || kase.ambulance || kase.status === "COMPLETED") return
    const timer = window.setInterval(() => {
      const active = getActiveCase()
      if (active && shouldEscalate(active)) {
        setEscalated(true)
        const at = new Date().toISOString()
        const updated: EmergencyCase = {
          ...active,
          priority: "CRITICAL",
          timeline: [...active.timeline, { at, label: "Case escalated — no ambulance available in time", detail: "Priority raised to CRITICAL; emergency contact alert sent" }],
        }
        setKase(updated)
        saveActiveCase(updated)
        void emitN8nEvent({ event: "emergency.escalated", source: "emergency-center", payload: { caseId: active.id, reason: "ambulance SLA exceeded" } })
        setToastMessage("Case escalated — priority raised and emergency contact alerted")
        window.setTimeout(() => setToastMessage(""), 4000)
      }
    }, 5000)
    return () => window.clearInterval(timer)
  }, [kase, escalated])

  const captureGps = () => {
    if (!navigator.geolocation) { setGpsState("unavailable"); return }
    setGpsState("locating")
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGps({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: Math.round(position.coords.accuracy) })
        setGpsState("locked")
      },
      () => setGpsState("denied"),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  const toggleVoice = () => {
    if (listening) { recognitionRef.current?.stop(); setListening(false); return }
    const Ctor = SpeechRecognitionCtor
    if (!Ctor) { setToastMessage("Voice input is not supported in this browser — please type the description"); window.setTimeout(() => setToastMessage(""), 3500); return }
    const recognition = new Ctor()
    recognition.lang = "en-IN"
    recognition.interimResults = false
    recognition.continuous = true
    voiceBufferRef.current = ""
    recognition.onresult = (event) => {
      let text = ""
      for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript + " "
      voiceBufferRef.current = text.trim()
      const target = formRef.current?.elements.namedItem("voiceTranscript") as HTMLTextAreaElement | null
      if (target) target.value = text.trim()
    }
    recognition.onerror = () => setListening(false)
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

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
      void emitN8nEvent({ event: "emergency.reported", source: "emergency-center", payload: { gps: gps ? `${gps.lat.toFixed(4)},${gps.lng.toFixed(4)} ±${gps.accuracy}m` : "manual location only" } })
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
    void emitN8nEvent({ event: "emergency.resolved", source: "emergency-center", payload: { caseId: kase.id } })
    setToastMessage("Case completed — timeline archived")
    window.setTimeout(() => setToastMessage(""), 3000)
  }

  const advanceAmbulance = () => {
    if (!kase?.ambulance) return
    const next = nextAmbulanceStatus(kase.ambulance.status)
    const at = new Date().toISOString()
    const updated: EmergencyCase = {
      ...kase,
      status: next === "TRANSPORTING" ? "TRANSPORTING" : kase.status,
      ambulance: { ...kase.ambulance, status: next, updatedAt: at },
      timeline: [...kase.timeline, { at, label: `Ambulance ${next.toLowerCase()}` }],
    }
    setKase(updated)
    saveActiveCase(updated)
    void emitN8nEvent({ event: "ambulance.status_changed", source: "emergency-center", payload: { caseId: kase.id, status: next } })
  }

  const cancelCase = () => {
    if (!kase) return
    const at = new Date().toISOString()
    const updated: EmergencyCase = {
      ...kase,
      status: "COMPLETED",
      timeline: [...kase.timeline, { at, label: "Emergency cancelled by reporter" }],
    }
    saveActiveCase(null)
    setKase(updated)
    setPhase("report")
    void emitN8nEvent({ event: "emergency.cancelled", source: "emergency-center", payload: { caseId: kase.id } })
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
        <>
          <section className="card sos-card">
            <button type="button" className="sos-button" onClick={captureGps} aria-label="One-tap emergency: capture location and start reporting">
              <Zap size={30} />
              <span>SOS</span>
            </button>
            <div className="sos-copy">
              <strong>One-tap emergency</strong>
              <small>
                {gpsState === "idle" && "Tap to capture your GPS location, then add details — every second counts."}
                {gpsState === "locating" && "Acquiring GPS lock…"}
                {gpsState === "locked" && gps && `Location locked (±${gps.accuracy} m) — coordinates will be shared with responders.`}
                {gpsState === "denied" && "Location permission denied — fill in the location manually below."}
                {gpsState === "unavailable" && "GPS unavailable on this device — fill in the location manually below."}
              </small>
            </div>
          </section>
          <form className="card" ref={formRef} onSubmit={submitReport}>
          <div className="panel-heading"><div><h2>Report the incident</h2><p>Bystander input — fill what you know. Voice and location are optional.</p></div><Siren className="verified" /></div>
          <div className="edit-grid">
            <label>Location<input name="location" required defaultValue={gps ? `GPS: ${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}` : ""} placeholder="e.g. Near the junction of 5th Ave" /></label>
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
          <div className="voice-row">
            <label className="voice-label">Voice description (optional)<textarea name="voiceTranscript" rows={2} placeholder="e.g. Two people injured near the junction, one is unconscious…" /></label>
            <button type="button" className={`mic-button ${listening ? "listening" : ""}`} onClick={toggleVoice} aria-label={listening ? "Stop voice input" : "Start voice input"}>
              {listening ? <MicOff size={18} /> : <Mic size={18} />}
              {listening ? <span>Listening…</span> : <span>Speak</span>}
            </button>
          </div>
          <label className="voice-label">Scene note (optional)<textarea name="imageNote" rows={2} placeholder="Describe what you see — vehicles involved, hazards, weather…" /></label>
          <div className="modal-actions">
            <button className="btn primary" disabled={busy}>{busy ? "Assessing…" : <><Siren size={16} /> Start emergency case</>}</button>
          </div>
        </form>
        </>
      )}

      {phase === "assessing" && (
        <div className="card center-card">
          <motion.p animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.4 }}>Structuring the incident and assessing priority…</motion.p>
        </div>
      )}

      {phase === "coordinate" && kase && assessment && (
        <>
          <div className="case-stepper" role="list" aria-label="Emergency case progress">
            {STEPS.map((label, index) => (
              <div key={label} className={`step ${index <= stepIndex(kase) ? "done" : ""} ${index === stepIndex(kase) && kase.status !== "COMPLETED" ? "current" : ""}`} role="listitem">
                <span className="step-dot" /><small>{label}</small>
              </div>
            ))}
          </div>
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
              {kase.ambulance && kase.ambulance.status !== "COMPLETED" && <button className="outline" onClick={advanceAmbulance}>Advance status ({nextAmbulanceStatus(kase.ambulance.status)})</button>}
              {kase.status === "AMBULANCE_DISPATCHED" && <button className="primary" onClick={completeCase}>Mark case completed</button>}
              {kase.status !== "COMPLETED" && <button className="danger-link" onClick={cancelCase}>Cancel case</button>}
            </div>
          </section>
        </>
      )}

      {toastMessage && <div className="toast"><Check size={16} />{toastMessage}</div>}
      <p className="responder-foot"><Phone size={14} /> In a real emergency always call your local emergency number first. RESQNOW coordinates alongside professional services.</p>
    </main>
  )
}

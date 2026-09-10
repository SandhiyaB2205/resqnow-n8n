import { getStored, setStored, removeStored } from "./storage"
import type { PatientProfile } from "./types"

/* ================= Emergency coordination ================= */

export type EmergencyPriority = "CRITICAL" | "HIGH" | "MODERATE" | "LOW" | "UNKNOWN"
export type EmergencyStatus = "REPORTING" | "ASSESSED" | "HOSPITAL_ACCEPTED" | "AMBULANCE_DISPATCHED" | "TRANSPORTING" | "COMPLETED"
export type AmbulanceStatus = "REQUESTED" | "ASSIGNED" | "EN ROUTE" | "ARRIVED" | "PICKUP" | "TRANSPORTING" | "ARRIVED HOSPITAL" | "COMPLETED"

export interface EmergencyCase {
  id: string
  caseCode: string
  status: EmergencyStatus
  priority: EmergencyPriority
  /** Confidence of the AI assessment, 0–1. Assessment is assistive only. */
  assessmentConfidence: number
  incident: {
    location: string
    injuredCount: number
    conscious: boolean
    breathing: boolean
    visibleBleeding: boolean
    accidentType: string
    voiceTranscript?: string
    imageNote?: string
  }
  indicators: string[]
  uncertainties: string[]
  hospital?: { id: string; name: string; distanceKm: number; etaMin: number; acceptedAt: string }
  ambulance?: { id: string; unit: string; status: AmbulanceStatus; etaMin: number; updatedAt: string }
  timeline: { at: string; label: string; detail?: string }[]
  createdAt: string
}

export interface Hospital {
  id: string
  name: string
  distanceKm: number
  etaMin: number
  capabilities: string[]
}

/** Static capability catalog. Live availability is NOT fabricated — see ranking. */
export const HOSPITALS: Hospital[] = [
  { id: "h-city-general", name: "City General Hospital", distanceKm: 4.2, etaMin: 9, capabilities: ["Emergency department", "Trauma centre", "ICU", "Blood bank", "Operating theatre", "Trauma specialists"] },
  { id: "h-st-mary", name: "St. Mary's Multispeciality", distanceKm: 6.8, etaMin: 14, capabilities: ["Emergency department", "ICU", "Blood bank", "Cardiac care"] },
  { id: "h-apollo", name: "Apollo Emergency Care", distanceKm: 2.9, etaMin: 7, capabilities: ["Emergency department", "ICU", "Operating theatre"] },
  { id: "h-unity", name: "Unity Trauma Center", distanceKm: 9.5, etaMin: 18, capabilities: ["Trauma centre", "Trauma specialists", "ICU", "Blood bank", "Operating theatre", "Neurosurgery"] },
]

export const AMBULANCE_UNITS = [
  { id: "amb-1", unit: "AMB-01 · Advanced Life Support", baseKm: 3.1 },
  { id: "amb-2", unit: "AMB-02 · Basic Life Support", baseKm: 5.4 },
  { id: "amb-3", unit: "AMB-03 · Advanced Life Support", baseKm: 7.2 },
]

export interface Assessment {
  priority: EmergencyPriority
  confidence: number
  indicators: string[]
  uncertainties: string[]
}

/**
 * Rule-based assistive triage. Organizes reported indicators only — it never
 * diagnoses. Professional assessment is always required (shown in the UI).
 */
export function assessEmergency(input: EmergencyCase["incident"]): Assessment {
  const indicators: string[] = []
  const uncertainties: string[] = []
  let score = 0

  if (!input.breathing) { indicators.push("Not breathing — immediate life threat"); score += 6 } else if (input.breathing) { indicators.push("Breathing present") }
  if (!input.conscious) { indicators.push("Unconscious respondent report"); score += 5 } else { indicators.push("Conscious") }
  if (input.visibleBleeding) { indicators.push("Visible bleeding reported"); score += 3 }
  if (input.injuredCount >= 3) { indicators.push(`Multiple casualties (${input.injuredCount})`); score += 2 }
  if (/fall|height|drown|electric|fire|crash|collision/i.test(input.accidentType)) { indicators.push(`High-impact mechanism: ${input.accidentType}`); score += 2 }
  if (input.voiceTranscript) {
    if (/unconscious|not breathing|bleeding|severe/i.test(input.voiceTranscript)) { indicators.push("Voice report mentions severe indicators"); score += 2 }
    else uncertainties.push("Voice transcript did not clearly mention severity markers")
  }
  if (!input.voiceTranscript && !input.imageNote) uncertainties.push("No voice or scene information provided — assessment based on form only")
  if (score === 0) uncertainties.push("Insufficient information to indicate severity")

  const priority: EmergencyPriority = score >= 7 ? "CRITICAL" : score >= 4 ? "HIGH" : score >= 2 ? "MODERATE" : score > 0 ? "LOW" : "UNKNOWN"
  return { priority, confidence: Math.min(0.95, 0.4 + score * 0.07), indicators, uncertainties }
}

/** Capability-based ranking — never claims live capacity. */
export function rankHospitals(assessment: Assessment): (Hospital & { matched: string[]; score: number })[] {
  const needTrauma = assessment.priority === "CRITICAL" || assessment.priority === "HIGH"
  return HOSPITALS.map((hospital) => {
    const matched = hospital.capabilities.filter((cap) =>
      (needTrauma && /trauma/i.test(cap)) ||
      /Emergency department|ICU/.test(cap) ||
      (assessment.indicators.some((i) => /bleeding/i.test(i)) && cap === "Blood bank"),
    )
    const capabilityScore = matched.length * 10
    const proximityScore = Math.max(0, 30 - hospital.etaMin)
    return { ...hospital, matched, score: capabilityScore + proximityScore }
  }).sort((a, b) => b.score - a.score)
}

const CASE_KEY = "resq-emergency-case"

export function getActiveCase(): EmergencyCase | null {
  return getStored<EmergencyCase | null>(CASE_KEY, null)
}
export function saveActiveCase(kase: EmergencyCase | null) {
  if (kase === null) { removeStored(CASE_KEY); return }
  setStored(CASE_KEY, kase)
}
export function newCaseCode(): string {
  return `EMG-${Date.now().toString(36).toUpperCase().slice(-6)}`
}

/* ================= Documents & extraction (OCR pipeline) ================= */

export type DocumentKind = "Prescription" | "Lab Report" | "Discharge Summary" | "Medical Certificate" | "Other"

export interface ExtractedField { label: string; value: string; confidence: number }

export interface WalletDocument {
  id: string
  title: string
  kind: DocumentKind
  uploadedAt: string
  /** extraction stage: queued → extracted → reviewed → verified | needs-quality */
  stage: "QUEUED" | "EXTRACTED" | "REVIEWED" | "VERIFIED" | "NEEDS_QUALITY"
  fields: ExtractedField[]
  qualityNotes: string[]
  /** patient's chance to correct OCR mistakes before verification */
  patientCorrections?: number
}

const DOCS_KEY = "resq-documents"

export function getDocuments(): WalletDocument[] {
  return getStored<WalletDocument[]>(DOCS_KEY, [])
}
export function saveDocuments(docs: WalletDocument[]) {
  setStored(DOCS_KEY, docs)
}

const PRESCRIPTION_FIELDS = ["Doctor", "Patient", "Date", "Diagnosis", "Medicine", "Strength", "Dosage", "Frequency", "Duration", "Instructions"]
const LAB_FIELDS = ["Test", "Result", "Unit", "Reference range", "Date", "Laboratory"]

/**
 * Document intake stage. With no OCR engine connected the extraction returns
 * EMPTY fields and says so — the patient fills them in from the document and a
 * provider verifies. Never fabricates extracted values (product rule).
 */
export function extractDocument(fileName: string, kind: DocumentKind): WalletDocument {
  const recognized = ["Prescription", "Lab Report", "Discharge Summary", "Medical Certificate"].includes(kind)
  const fields: ExtractedField[] = (kind === "Lab Report" ? LAB_FIELDS : PRESCRIPTION_FIELDS).map((label) => ({
    label,
    value: "",
    confidence: 0,
  }))
  const qualityNotes = recognized
    ? ["Automatic text extraction is not connected for this file yet — fill in the details below from the document, then send for verification."]
    : ["Document type not confidently recognized — fill in the details below, then send for verification."]
  return {
    id: `doc-${Date.now().toString(36)}`,
    title: fileName,
    kind,
    uploadedAt: new Date().toISOString(),
    stage: "EXTRACTED",
    fields,
    qualityNotes,
  }
}

/* ================= Provider access requests ================= */

export type AccessRequestStatus = "PENDING" | "APPROVED" | "DENIED" | "EXPIRED"

export interface AccessRequest {
  id: string
  providerId: string
  providerName: string
  facility: string
  purpose: string
  scopes: string[]
  durationMinutes: number
  status: AccessRequestStatus
  requestedAt: string
  decidedAt?: string
}

const REQUESTS_KEY = "resq-access-requests"

export function getAccessRequests(): AccessRequest[] {
  return getStored<AccessRequest[]>(REQUESTS_KEY, [])
}
export function saveAccessRequests(requests: AccessRequest[]) {
  setStored(REQUESTS_KEY, requests)
}

/* ================= Notifications ================= */

export interface PlatformNotification {
  id: string
  kind: "verification" | "access" | "emergency" | "consent" | "system"
  title: string
  body: string
  read: boolean
  createdAt: string
  requestId?: string
}

const NOTIF_KEY = "resq-platform-notifications"

export function getPlatformNotifications(): PlatformNotification[] {
  return getStored<PlatformNotification[]>(NOTIF_KEY, [])
}
export function savePlatformNotifications(items: PlatformNotification[]) {
  setStored(NOTIF_KEY, items)
}

/* ================= Emergency QR tokens ================= */

const QR_TOKEN_KEY = "resq-qr-token"

/** Secure reference token — the QR never contains medical data, only this. */
export function issueQrToken(): string {
  const token = `rsq_${cryptoRandom()}`
  setStored(QR_TOKEN_KEY, { token, issuedAt: new Date().toISOString() })
  return token
}

export function getCurrentQrToken(): string {
  const stored = getStored<{ token: string; issuedAt: string } | null>(QR_TOKEN_KEY, null)
  if (stored?.token) return stored.token
  return issueQrToken()
}

export function revokeQrToken(): string {
  return issueQrToken()
}

function cryptoRandom(): string {
  try {
    const bytes = new Uint8Array(12)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36)
  }
}

/** Minimal emergency payload shared with responders after token validation. */
export function emergencyPayloadFor(profile: PatientProfile) {
  return {
    bloodGroup: profile.bloodGroup,
    allergies: profile.allergies,
    currentMedication: profile.medications,
    majorConditions: profile.conditions,
    previousMajorSurgery: profile.procedures,
    emergencyContact: profile.emergencyContact,
  }
}

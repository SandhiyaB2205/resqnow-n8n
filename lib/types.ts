export type ConsentStatus = "ACTIVE" | "EXPIRED" | "REVOKED"
export type AuditStatus = "AUTHORIZED" | "EXPIRED" | "REVOKED"

export interface PatientProfile {
  id: string
  name: string
  dob: string
  bloodGroup: string
  emergencyContact: string
  allergies: string[]
  medications: string[]
  conditions: string[]
  procedures: string[]
}

export interface MedicalRecord {
  id: string
  title: string
  provider: string
  date: string
  type: string
  fileName?: string
  /** Short document preview text (demo stand-in for file storage) */
  data?: string
  status: "VERIFIED" | "PENDING"
}

export interface Consent {
  id: string
  providerId: string
  providerName: string
  facility: string
  selectedData: string[]
  purpose: string
  createdAt: string
  expiresAt: string
  status: ConsentStatus
}

export interface AuditEvent {
  id: string
  actor: string
  action: string
  time: string
  status: AuditStatus
}

export interface Notification {
  id: string
  title: string
  body: string
  read: boolean
  createdAt: string
}

export interface EmergencyQR {
  id: string
  status: "ACTIVE" | "REVOKED"
  updatedAt: string
  sharedItems: string[]
}

export interface Session {
  authenticated: boolean
  role: "patient" | "provider"
  email: string
  userId?: string
}

export interface AppSettings {
  demoMode: boolean
  notificationsEnabled: boolean
  emergencyProfileEnabled: boolean
  n8nEnabled: boolean
}

export interface Provider {
  id: string
  name: string
  facility: string
  role: string
}

export interface AppState {
  profile: PatientProfile
  records: MedicalRecord[]
  consents: Consent[]
  audit: AuditEvent[]
  notifications: Notification[]
  emergencyQR: EmergencyQR
  settings: AppSettings
  session: Session | null
}

/* ---------------- n8n workflow integration types ---------------- */

export type N8nRunStatus = "success" | "error" | "running" | "waiting"

export interface N8nWorkflow {
  id: string
  name: string
  trigger: string
  description: string
  /** Relative path of the importable workflow JSON under /workflows */
  file: string
  /** App pages/API routes wired to this workflow */
  wiredTo: string[]
  active: boolean
  /** Demo executions shown before a live n8n instance is connected */
  demoRuns: N8nRun[]
}

export interface N8nRun {
  id: string
  workflowId: string
  workflowName: string
  status: N8nRunStatus
  startedAt: string
  durationMs: number
  mode: "demo" | "webhook"
  trigger: string
  detail: string
}

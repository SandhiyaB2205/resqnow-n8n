export type ConsentStatus = "ACTIVE" | "EXPIRED" | "REVOKED"
export type AuditStatus = "AUTHORIZED" | "EXPIRED" | "REVOKED"

export interface PatientProfile { id: string; name: string; dob: string; bloodGroup: string; emergencyContact: string; allergies: string[]; medications: string[]; conditions: string[]; procedures: string[] }
export interface MedicalRecord { id: string; title: string; provider: string; facility: string; date: string; type: string; fileName?: string; patientName?: string; dateOfBirth?: string; description?: string; additionalInfo?: string; rawText?: string; confidence?: number; extractionStatus?: string; status: "VERIFIED" | "PENDING" }
export interface Consent { id: string; providerId: string; providerName: string; facility: string; selectedData: string[]; purpose: string; createdAt: string; expiresAt: string; status: ConsentStatus }
export interface AuditEvent { id: string; actor: string; action: string; time: string; status: AuditStatus }
export interface Notification { id: string; title: string; body: string; read: boolean; createdAt: string }
export interface EmergencyQR { id: string; status: "ACTIVE" | "REVOKED"; updatedAt: string; sharedItems: string[] }
export interface Session { authenticated: boolean; role: "patient" | "provider"; userId: string }
export interface AppSettings { demoMode: boolean; notificationsEnabled: boolean; emergencyProfileEnabled: boolean }
export interface Provider { id: string; name: string; facility: string; role: string }
export interface AppState { profile: PatientProfile; records: MedicalRecord[]; consents: Consent[]; audit: AuditEvent[]; notifications: Notification[]; emergencyQR: EmergencyQR; settings: AppSettings; session: Session | null }

import type { AuditEvent, AppSettings, Consent, EmergencyQR, MedicalRecord, N8nRun, Notification, PatientProfile, Provider } from "./types"

export const mockProfile: PatientProfile = {
  id: "patient-demo",
  name: "Sandhiya Prakash",
  dob: "1998-09-18",
  bloodGroup: "O+",
  emergencyContact: "+91 98410 22310",
  allergies: ["Penicillin"],
  medications: ["Insulin · 10 units · Twice daily"],
  conditions: ["Type 1 Diabetes"],
  procedures: ["Appendectomy · 2024"],
}

export const mockProviders: Provider[] = [
  { id: "dr-priya", name: "Dr. Priya Shah", facility: "City General Hospital", role: "Consulting physician" },
  { id: "dr-kumar", name: "Dr. Arjun Kumar", facility: "City General Hospital", role: "Emergency physician" },
  { id: "apollo", name: "Apollo Diagnostics", facility: "Apollo Diagnostics", role: "Laboratory" },
]

export const mockRecords: MedicalRecord[] = [
  { id: "blood-test", title: "Blood Test", provider: "Apollo Diagnostics", date: "12 Aug 2026", type: "Lab Reports", fileName: "blood-panel-aug2026.pdf", status: "VERIFIED", data: "HbA1c 6.8% · Fasting glucose 112 mg/dL · All other panels within range." },
  { id: "prescription", title: "Prescription", provider: "Dr. Priya Shah", date: "08 Aug 2026", type: "Prescriptions", fileName: "rx-insulin-refill.pdf", status: "VERIFIED", data: "Insulin glargine 10 units twice daily. Review in 3 months." },
  { id: "discharge", title: "Discharge Summary", provider: "City General Hospital", date: "20 Jul 2026", type: "Discharge Summaries", fileName: "discharge-jul2026.pdf", status: "VERIFIED", data: "Laparoscopic appendectomy. Uneventful recovery. Suture removal completed." },
  { id: "scan-report", title: "Scan Report", provider: "Apollo Diagnostics", date: "04 Jul 2026", type: "Lab Reports", fileName: "ultrasound-jul2026.pdf", status: "PENDING", data: "Abdominal ultrasound — no acute findings. Report pending radiologist sign-off." },
]

export const mockConsents: Consent[] = [
  { id: "consent-priya", providerId: "dr-priya", providerName: "Dr. Priya Shah", facility: "City General Hospital", selectedData: ["Allergies", "Medications", "Recent Lab Reports"], purpose: "Consultation", createdAt: "2026-08-14T10:30:00Z", expiresAt: "2026-09-24T10:30:00Z", status: "ACTIVE" },
  { id: "consent-apollo", providerId: "apollo", providerName: "Apollo Diagnostics", facility: "Apollo Diagnostics", selectedData: ["Lab Reports"], purpose: "Diagnostic testing", createdAt: "2026-07-01T09:00:00Z", expiresAt: "2026-08-01T09:00:00Z", status: "EXPIRED" },
]

export const mockAudit: AuditEvent[] = [
  { id: "audit-1", actor: "Dr. Priya Shah", action: "Viewed Allergies", time: "Today · 10:32 AM", status: "AUTHORIZED" },
  { id: "audit-2", actor: "City General Hospital", action: "Viewed Lab Reports", time: "Today · 09:15 AM", status: "AUTHORIZED" },
  { id: "audit-3", actor: "Emergency workflow", action: "Emergency QR scanned — responder packet delivered", time: "Yesterday · 6:02 PM", status: "AUTHORIZED" },
  { id: "audit-4", actor: "Dr. Kumar", action: "Prescription access expired", time: "Yesterday", status: "EXPIRED" },
]

export const mockNotifications: Notification[] = [
  { id: "notice-1", title: "New access activity", body: "Dr. Priya Shah viewed your allergies.", read: false, createdAt: "Today · 10:32 AM" },
  { id: "notice-2", title: "Workflow completed", body: "Your emergency packet was delivered to the responder.", read: false, createdAt: "Yesterday · 6:02 PM" },
]

export const mockEmergencyQR: EmergencyQR = { id: "qr-demo-1", status: "ACTIVE", updatedAt: "Today · 10:32 AM", sharedItems: ["Blood group", "Allergies", "Medication", "Condition"] }

export const mockSettings: AppSettings = { demoMode: true, notificationsEnabled: true, emergencyProfileEnabled: true, n8nEnabled: true }

export const mockWorkflowRuns: N8nRun[] = [
  { id: "run-1", workflowId: "wf-emergency", workflowName: "Emergency QR responder packet", status: "success", startedAt: "Yesterday · 6:02 PM", durationMs: 420, mode: "webhook", trigger: "QR scan", detail: "Fetched critical profile → logged audit event → SMS sent to emergency contact." },
  { id: "run-2", workflowId: "wf-consent", workflowName: "Consent lifecycle automation", status: "success", startedAt: "Today · 9:15 AM", durationMs: 210, mode: "webhook", trigger: "Access request", detail: "Validated consent window for City General Hospital → logged access." },
  { id: "run-3", workflowId: "wf-notify", workflowName: "Access notification fan-out", status: "success", startedAt: "Today · 10:32 AM", durationMs: 160, mode: "webhook", trigger: "Record viewed", detail: "Created in-app notification for new provider access." },
  { id: "run-4", workflowId: "wf-record", workflowName: "Record intake & verification", status: "running", startedAt: "Just now", durationMs: 0, mode: "webhook", trigger: "New record uploaded", detail: "Verifying provider signature and filing the document…" },
]

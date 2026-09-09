"use server"

import { and, eq, desc } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "../../lib/auth"
import { db } from "../../lib/db"
import { auditEvents, consents, healthProfiles, healthRecords, emergencyTokens, providers, user } from "../../lib/db/schema"
import { createHash, randomBytes } from "node:crypto"

async function getSession() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) throw new Error("Unauthorized")
  return session
}

async function getUserId() {
  const session = await getSession()
  return session.user.id
}

async function requirePatient() {
  const session = await getSession()
  if ((session.user as { role?: string }).role === "doctor") throw new Error("Patient access required")
  return session.user.id
}

export async function registerProvider(input: { fullName: string; email: string; affiliation: string; licenseNumber: string }) {
  const session = await getSession()
  if ((session.user as { role?: string }).role !== "doctor") throw new Error("Doctor access required")
  if (!input.fullName.trim() || !input.email.trim() || !input.affiliation.trim() || !input.licenseNumber.trim()) throw new Error("Provider details are required")
  const provider = { id: crypto.randomUUID(), doctorId: session.user.id, fullName: input.fullName.trim(), email: input.email.trim().toLowerCase(), affiliation: input.affiliation.trim(), licenseNumber: input.licenseNumber.trim(), verificationStatus: "pending" as const }
  await db.insert(providers).values(provider).onConflictDoUpdate({ target: providers.doctorId, set: { fullName: provider.fullName, email: provider.email, affiliation: provider.affiliation, licenseNumber: provider.licenseNumber, verificationStatus: "pending", updatedAt: new Date() } })
  return { ...provider, verificationStatus: "pending" }
}

export async function loadVerifiedProviders() {
  await requirePatient()
  const rows = await db.select({ id: providers.id, name: providers.affiliation, facility: providers.affiliation, licenseNumber: providers.licenseNumber }).from(providers).where(eq(providers.verificationStatus, "verified"))
  return Array.from(new Map(rows.map((row) => [row.facility.toLowerCase(), row])).values())
}

export async function loadDoctorAccess() {
  const session = await getSession()
  if ((session.user as { role?: string }).role !== "doctor") throw new Error("Doctor access required")
  const providerRows = await db.select().from(providers).where(eq(providers.doctorId, session.user.id)).limit(1)
  const provider = providerRows[0]
  if (!provider) return { provider: null, patients: [], records: [] }
  if (provider.verificationStatus !== "verified") return { provider, patients: [], records: [] }
  const shared = await db.select({ patientId: consents.userId, data: consents.data }).from(consents)
  const active = shared.filter((row) => { const data = row.data as Record<string, unknown>; return data.facility === provider.affiliation || data.providerId === provider.id || data.providerId === provider.doctorId ? data.status === "ACTIVE" : false })
  const patientIds = active.map((row) => row.patientId)
  if (!patientIds.length) return { provider, patients: [], records: [] }
  const recordRows = await db.select().from(healthRecords)
  const records = recordRows.filter((row) => patientIds.includes(row.userId)).map((row) => ({ id: row.id, ...(row.data as Record<string, unknown>) }))
  const patientRows = await db.select({ id: user.id, name: user.name, email: user.email }).from(user)
  return { provider, patients: patientRows.filter((row) => patientIds.includes(row.id)), records }
}

function cleanJson(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid data")
  return value as Record<string, unknown>
}

export async function loadWallet() {
  const userId = await requirePatient()
  const [profile, records, consentRows, audit] = await Promise.all([
    db.select().from(healthProfiles).where(eq(healthProfiles.userId, userId)).limit(1),
    db.select().from(healthRecords).where(eq(healthRecords.userId, userId)).orderBy(desc(healthRecords.updatedAt)),
    db.select().from(consents).where(eq(consents.userId, userId)).orderBy(desc(consents.updatedAt)),
    db.select().from(auditEvents).where(eq(auditEvents.userId, userId)).orderBy(desc(auditEvents.createdAt)).limit(20),
  ])
  return { profile: profile[0]?.data ?? null, records: records.map((row) => ({ id: row.id, ...(row.data as Record<string, unknown>) })), consents: consentRows.map((row) => ({ id: row.id, ...(row.data as Record<string, unknown>) })), audit: audit.map((row) => row.data) }
}

export async function saveProfile(data: unknown) {
  const userId = await requirePatient(); const payload = cleanJson(data)
  await db.insert(healthProfiles).values({ userId, data: payload, updatedAt: new Date() }).onConflictDoUpdate({ target: healthProfiles.userId, set: { data: payload, updatedAt: new Date() } })
  revalidatePath("/"); return payload
}

export async function createRecord(id: string, data: unknown) {
  const userId = await requirePatient(); const payload = cleanJson(data)
  await db.insert(healthRecords).values({ id, userId, data: payload, updatedAt: new Date() }).onConflictDoUpdate({ target: healthRecords.id, set: { data: payload, updatedAt: new Date() } })
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), userId, data: { action: "record_created", recordId: id, createdAt: new Date().toISOString() } })
  revalidatePath("/"); return { id, ...payload }
}

export async function createConsent(data: unknown) {
  const userId = await requirePatient(); const payload = cleanJson(data); const id = String(payload.id || crypto.randomUUID())
  await db.insert(consents).values({ id, userId, data: payload, updatedAt: new Date() }).onConflictDoUpdate({ target: consents.id, set: { data: payload, updatedAt: new Date() } })
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), userId, data: { action: "consent_granted", consentId: id, createdAt: new Date().toISOString() } })
  revalidatePath("/"); return { id, ...payload }
}

export async function revokeConsent(id: string) {
  const userId = await requirePatient()
  const existing = await db.select().from(consents).where(and(eq(consents.id, id), eq(consents.userId, userId))).limit(1)
  if (!existing[0]) throw new Error("Consent not found")
  const payload = { ...(existing[0].data as Record<string, unknown>), status: "REVOKED", revokedAt: new Date().toISOString() }
  await db.update(consents).set({ data: payload, updatedAt: new Date() }).where(and(eq(consents.id, id), eq(consents.userId, userId)))
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), userId, data: { action: "consent_revoked", consentId: id, createdAt: new Date().toISOString(), status: "REVOKED" } })
  revalidatePath("/"); return { ok: true }
}

export async function createEmergencyToken(sharedItems: string[] = []) {
  const userId = await requirePatient(); const token = randomBytes(24).toString("base64url"); const tokenHash = createHash("sha256").update(token).digest("hex")
  await db.insert(emergencyTokens).values({ id: crypto.randomUUID(), userId, tokenHash, sharedItems })
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), userId, data: { action: "emergency_token_created", createdAt: new Date().toISOString() } })
  return { token, sharedItems }
}

export async function addAuditEvent(data: unknown) {
  const userId = await requirePatient(); const payload = cleanJson(data)
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), userId, data: payload })
  revalidatePath("/"); return { ok: true }
}

async function requireAdmin() {
  const session = await getSession()
  const allowed = (process.env.ADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean)
  if (!allowed.includes(session.user.email.toLowerCase())) throw new Error("Admin access required")
  return session.user.id
}

export async function loadVerificationQueue() {
  await requireAdmin()
  return db.select().from(providers).orderBy(desc(providers.updatedAt))
}

export async function updateProviderVerification(providerId: string, status: "verified" | "rejected" | "pending") {
  const adminId = await requireAdmin()
  const result = await db.update(providers).set({ verificationStatus: status, updatedAt: new Date() }).where(eq(providers.id, providerId)).returning()
  if (!result[0]) throw new Error("Doctor application not found")
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), userId: result[0].doctorId, data: { action: `doctor_${status}`, providerId, adminId, createdAt: new Date().toISOString() } })
  revalidatePath("/admin/verification"); revalidatePath("/doctor"); revalidatePath("/dashboard")
  return result[0]
}

export async function loadVerifiedHospitals() {
  await requirePatient()
  const rows = await db.select({ id: providers.id, hospital: providers.affiliation, licenseNumber: providers.licenseNumber }).from(providers).where(eq(providers.verificationStatus, "verified"))
  return Array.from(new Map(rows.map((row) => [row.hospital.toLowerCase(), row])).values())
}

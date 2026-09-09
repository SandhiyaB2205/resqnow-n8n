"use server"

import { and, eq, desc } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "../../lib/auth"
import { db } from "../../lib/db"
import { auditEvents, consents, healthProfiles, healthRecords } from "../../lib/db/schema"

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) throw new Error("Unauthorized")
  return session.user.id
}

function cleanJson(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid data")
  return value as Record<string, unknown>
}

export async function loadWallet() {
  const userId = await getUserId()
  const [profile, records, consentRows, audit] = await Promise.all([
    db.select().from(healthProfiles).where(eq(healthProfiles.userId, userId)).limit(1),
    db.select().from(healthRecords).where(eq(healthRecords.userId, userId)).orderBy(desc(healthRecords.updatedAt)),
    db.select().from(consents).where(eq(consents.userId, userId)).orderBy(desc(consents.updatedAt)),
    db.select().from(auditEvents).where(eq(auditEvents.userId, userId)).orderBy(desc(auditEvents.createdAt)).limit(20),
  ])
  return { profile: profile[0]?.data ?? null, records: records.map((row) => ({ id: row.id, ...row.data })), consents: consentRows.map((row) => ({ id: row.id, ...row.data })), audit: audit.map((row) => row.data) }
}

export async function saveProfile(data: unknown) {
  const userId = await getUserId(); const payload = cleanJson(data)
  await db.insert(healthProfiles).values({ userId, data: payload, updatedAt: new Date() }).onConflictDoUpdate({ target: healthProfiles.userId, set: { data: payload, updatedAt: new Date() } })
  revalidatePath("/"); return payload
}

export async function createRecord(id: string, data: unknown) {
  const userId = await getUserId(); const payload = cleanJson(data)
  await db.insert(healthRecords).values({ id, userId, data: payload, updatedAt: new Date() }).onConflictDoUpdate({ target: healthRecords.id, set: { data: payload, updatedAt: new Date() } })
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), userId, data: { action: "record_created", recordId: id, createdAt: new Date().toISOString() } })
  revalidatePath("/"); return { id, ...payload }
}

export async function revokeConsent(id: string) {
  const userId = await getUserId()
  await db.delete(consents).where(and(eq(consents.id, id), eq(consents.userId, userId)))
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), userId, data: { action: "consent_revoked", consentId: id, createdAt: new Date().toISOString() } })
  revalidatePath("/"); return { ok: true }
}

export async function addAuditEvent(data: unknown) {
  const userId = await getUserId(); const payload = cleanJson(data)
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), userId, data: payload })
  revalidatePath("/"); return { ok: true }
}

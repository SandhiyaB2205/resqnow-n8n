import type { PatientProfile } from "./types"

export const STORAGE_KEYS = { session: "resq-session", profile: "resq-profile", profileVersion: "resq-profile-version", records: "resq-records", consents: "resq-consents", audit: "resq-audit", notifications: "resq-notifications", settings: "resq-settings", qr: "resq-qr", demoMode: "resq-demo-mode", n8nRuns: "resq-n8n-runs" } as const

/** Bump when the shipped demo profile changes so stale local data migrates. */
const PROFILE_VERSION = "2026-09-10"

function available() { return typeof window !== "undefined" }
export function getStored<T>(key: string, fallback: T): T { if (!available()) return fallback; try { const value = window.localStorage.getItem(key); return value === null ? fallback : JSON.parse(value) as T } catch { return fallback } }
export function setStored<T>(key: string, value: T) { if (!available()) return; try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage can be unavailable in private browsing */ } }
export function removeStored(key: string) { if (!available()) return; try { window.localStorage.removeItem(key) } catch { /* ignore */ } }
export function resetStored() { if (!available()) return; Object.values(STORAGE_KEYS).forEach(removeStored) }

/** Shape guard: the profile storage once held a different (flat) shape. */
export function isPatientProfile(value: unknown): value is PatientProfile {
  if (typeof value !== "object" || value === null) return false
  const p = value as Record<string, unknown>
  return (
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    typeof p.bloodGroup === "string" &&
    typeof p.emergencyContact === "string" &&
    Array.isArray(p.allergies) && Array.isArray(p.medications) && Array.isArray(p.conditions) && Array.isArray(p.procedures)
  )
}

/** Loads the stored profile, falling back to `fallback` when absent or stale-shaped. */
export function loadProfile(fallback: PatientProfile): PatientProfile {
  if (!available()) return fallback
  const stored = getStored<unknown>(STORAGE_KEYS.profile, fallback)
  const version = window.localStorage.getItem(STORAGE_KEYS.profileVersion)
  if (!isPatientProfile(stored) || version !== PROFILE_VERSION) {
    setStored(STORAGE_KEYS.profile, fallback)
    window.localStorage.setItem(STORAGE_KEYS.profileVersion, PROFILE_VERSION)
    return fallback
  }
  return stored
}

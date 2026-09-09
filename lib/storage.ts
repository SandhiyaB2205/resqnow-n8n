export const STORAGE_KEYS = { session: "resq-session", profile: "resq-profile", records: "resq-records", consents: "resq-consents", audit: "resq-audit", notifications: "resq-notifications", settings: "resq-settings", qr: "resq-qr", demoMode: "resq-demo-mode" } as const

function available() { return typeof window !== "undefined" }
export function getStored<T>(key: string, fallback: T): T { if (!available()) return fallback; try { const value = window.localStorage.getItem(key); return value === null ? fallback : JSON.parse(value) as T } catch { return fallback } }
export function setStored<T>(key: string, value: T) { if (!available()) return; try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage can be unavailable in private browsing */ } }
export function removeStored(key: string) { if (!available()) return; try { window.localStorage.removeItem(key) } catch {} }
export function resetStored() { if (!available()) return; Object.values(STORAGE_KEYS).forEach(removeStored) }

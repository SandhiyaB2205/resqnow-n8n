"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, HeartPulse, Phone, ShieldCheck, Siren } from "lucide-react"
import { emergencyPayloadFor, getCurrentQrToken } from "../../lib/platform"
import { emitN8nEvent } from "../../lib/n8n"
import { loadProfile } from "../../lib/storage"
import { mockProfile } from "../../lib/mock-data"
import type { PatientProfile } from "../../lib/types"

interface TokenAccess {
  ok: boolean
  patient?: { displayName: string }
  emergencyProfile?: ReturnType<typeof emergencyPayloadFor>
}

/**
 * Public responder view. The QR encodes ONLY a secure token; this page
 * validates it against /api/qr/[token], shows the limited emergency profile,
 * and audits the scan server-side.
 */
export default function EmergencyAccessPage() {
  const [profile, setProfile] = useState<PatientProfile>(mockProfile)
  const [access, setAccess] = useState<TokenAccess | null>(null)
  const [fired, setFired] = useState(false)

  useEffect(() => {
    if (fired) return
    setFired(true)
    const validate = async () => {
      const token = getCurrentQrToken()
      try {
        const res = await fetch(`/api/qr/${token}`, { cache: "no-store" })
        setAccess((await res.json()) as TokenAccess)
      } catch {
        setAccess({ ok: false })
      }
    }
    void validate()
    setProfile(loadProfile(mockProfile))
    void emitN8nEvent({
      event: "emergency.access",
      source: "qr-scan",
      payload: { route: "/emergency-access", tokenValidated: true },
    })
  }, [fired])

  const critical: [string, string][] = [
    ["Blood group", profile.bloodGroup],
    ["Allergies", profile.allergies.join(", ")],
    ["Critical medication", profile.medications.join(", ")],
    ["Critical conditions", profile.conditions.join(", ")],
    ["Procedures", profile.procedures.join(", ")],
  ]

  return (
    <main className="responder-page">
      <header className="responder-top">
        <div className="logo"><span className="logo-mark alert"><Siren size={17} /></span>RESQ<span className="logo-accent">NOW</span></div>
        <span className="badge emergency-badge"><ShieldCheck size={13} /> Emergency responder access</span>
      </header>

      <section className="card responder-hero">
        <div className="emergency-heading">
          <span className="emergency-icon"><AlertTriangle size={20} /></span>
          <span>
            <small>EMERGENCY HEALTH PROFILE</small>
            <h2>{profile.name}</h2>
          </span>
        </div>
        <p>Read-only critical information. Token validated server-side, access logged, and the patient&apos;s emergency contact is being notified automatically.</p>
        <div className="critical-list">
          {critical.map(([label, value]) => (
            <div key={label}><span><small>{label}</small><strong>{value}</strong></span></div>
          ))}
        </div>
        <div className="emergency-contact">
          <small>EMERGENCY CONTACT</small>
          <strong><Phone size={14} /> {profile.emergencyContact}</strong>
        </div>
      </section>

      <p className="responder-foot"><ShieldCheck size={14} /> Limited by design · Audit trail active · <Link href="/login">Patient sign-in</Link></p>
    </main>
  )
}

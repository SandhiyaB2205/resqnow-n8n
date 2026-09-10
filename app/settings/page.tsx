"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Check, HeartPulse, ShieldCheck } from "lucide-react"
import { getStored, setStored, STORAGE_KEYS } from "../../lib/storage"
import { mockSettings } from "../../lib/mock-data"
import { emitN8nEvent, setN8nEmissionEnabled } from "../../lib/n8n"
import type { AppSettings } from "../../lib/types"

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(mockSettings)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = getStored(STORAGE_KEYS.settings, mockSettings)
    setSettings(stored)
    setN8nEmissionEnabled(stored.n8nEnabled !== false)
    setMounted(true)
  }, [])

  const update = (key: keyof AppSettings) => {
    const next = { ...settings, [key]: !settings[key] }
    setSettings(next)
    if (mounted) setStored(STORAGE_KEYS.settings, next)
    if (key === "n8nEnabled") setN8nEmissionEnabled(next.n8nEnabled !== false)
    void emitN8nEvent({ event: "settings.updated", source: "settings-page", payload: { setting: key, enabled: next[key] } })
  }

  return (
    <main className="standalone-content">
      <div className="auth-brand"><Link href="/dashboard"><span className="logo-mark"><HeartPulse size={19} /></span> RESQ<span className="logo-accent">NOW</span></Link></div>
      <Link href="/dashboard" className="back-link"><ArrowLeft size={15} /> Back to dashboard</Link>
      <div className="page-header">
        <div><div className="eyebrow">ACCOUNT</div><h1>Settings</h1><p>Manage your wallet preferences and privacy defaults.</p></div>
        <span className="badge"><ShieldCheck size={13} /> Wallet</span>
      </div>
      <section className="card settings-card">
        <div className="setting-row">
          <div><strong>Background services</strong><p>Keep extraction, verification and coordination running automatically.</p></div>
          <button className={`toggle ${settings.demoMode ? "on" : ""}`} onClick={() => update("demoMode")} aria-pressed={settings.demoMode}><span /></button>
        </div>
        <div className="setting-row">
          <div><strong>Access notifications</strong><p>Show alerts when providers view shared information.</p></div>
          <button className={`toggle ${settings.notificationsEnabled ? "on" : ""}`} onClick={() => update("notificationsEnabled")} aria-pressed={settings.notificationsEnabled}><span /></button>
        </div>
        <div className="setting-row">
          <div><strong>Emergency profile</strong><p>Keep your limited emergency QR profile available.</p></div>
          <button className={`toggle ${settings.emergencyProfileEnabled ? "on" : ""}`} onClick={() => update("emergencyProfileEnabled")} aria-pressed={settings.emergencyProfileEnabled}><span /></button>
        </div>
        <div className="setting-row">
          <div><strong>Automated processing</strong><p>When paused, wallet activity is not processed until you turn it back on.</p></div>
          <button className={`toggle ${settings.n8nEnabled ? "on" : ""}`} onClick={() => update("n8nEnabled")} aria-pressed={settings.n8nEnabled}><span /></button>
        </div>
      </section>
      <p className="auth-trust"><Check size={15} /> Changes are saved on this device only.</p>
    </main>
  )
}

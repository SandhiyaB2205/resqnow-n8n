"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { QRCodeCanvas } from "qrcode.react"
import {
  Activity, ArrowRight, Bell, Check, ChevronRight, Clock3, Copy, Download, FileText, HeartPulse, Home,
  Menu, Play, Printer, QrCode, Radio, Search, Settings as SettingsIcon, ShieldCheck, Siren, Stethoscope,
  UserRound, Users, Workflow, X, Zap,
} from "lucide-react"
import { mockAudit, mockConsents, mockEmergencyQR, mockNotifications, mockProfile, mockProviders, mockRecords, mockSettings } from "../../lib/mock-data"
import { N8N_WORKFLOWS } from "../../lib/n8n-workflows"
import { clearRuns, emitN8nEvent, fetchGatewayEvents, getRuns, n8nGatewayUrl, setN8nEmissionEnabled } from "../../lib/n8n"
import { pingGateway } from "../../lib/n8n-status"
import { getCurrentQrToken, revokeQrToken } from "../../lib/platform"
import type { N8nGatewayEvent } from "../../lib/n8n-server"
import type { AppSettings, AuditEvent, Consent, EmergencyQR, MedicalRecord, N8nRun, PatientProfile, Provider } from "../../lib/types"
import { getStored, loadProfile, resetStored, setStored, STORAGE_KEYS } from "../../lib/storage"
import { authClient, useSession } from "../../lib/auth-client"

// The QR encodes ONLY a secure reference token — never medical data.
const HERO_IMAGE = process.env.NEXT_PUBLIC_HERO_IMAGE_URL || "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=1400&q=80"

const nav = [
  { id: "dashboard", label: "Overview", icon: Home },
  { id: "profile", label: "Health profile", icon: UserRound },
  { id: "records", label: "Medical records", icon: FileText },
  { id: "share", label: "Consent & sharing", icon: ShieldCheck },
  { id: "history", label: "Access history", icon: Clock3 },
  { id: "workflows", label: "Automations", icon: Workflow },
  { id: "emergency", label: "Emergency QR", icon: Zap },
]

const quickLinks = [
  { href: "/emergency-center", label: "Emergency Center", icon: Siren, tone: "peach" },
  { href: "/documents", label: "Upload & extract", icon: FileText, tone: "mint" },
  { href: "/requests", label: "Access requests", icon: ShieldCheck, tone: "blue" },
] as const
const tour = ["dashboard", "profile", "records", "share", "history", "workflows", "emergency", "doctor"]

type ViewId = (typeof nav)[number]["id"] | "settings" | "doctor"

interface DemoSession { authenticated: boolean; email: string }
const ANON: DemoSession = { authenticated: false, email: "" }

export default function ResqnowApp({ initialView = "dashboard" }: { initialView?: ViewId } = {}) {
  const { data: authSession, isPending: authPending } = useSession()
  const [mounted, setMounted] = useState(false)
  const [demoSession, setDemoSession] = useState<DemoSession>(ANON)
  const [view, setView] = useState<ViewId>(initialView)
  const [menu, setMenu] = useState(false)
  const [profile, setProfile] = useState<PatientProfile>(mockProfile)
  const [records, setRecords] = useState<MedicalRecord[]>(mockRecords)
  const [consents, setConsents] = useState<Consent[]>(mockConsents)
  const [audit, setAudit] = useState<AuditEvent[]>(mockAudit)
  const [qr, setQr] = useState<EmergencyQR>(mockEmergencyQR)
  const [notifications, setNotifications] = useState(mockNotifications)
  const [settings, setSettings] = useState<AppSettings>(mockSettings)
  const [query, setQuery] = useState("")
  const [toast, setToast] = useState("")
  const [tourStep, setTourStep] = useState(-1)
  const [qrToken, setQrToken] = useState("")
  const toastTimer = useRef<number | null>(null)
  const qrRef = useRef<HTMLCanvasElement>(null)

  // Hydration-safe: only touch localStorage after mount (fixes SSR mismatch).
  useEffect(() => {
    setMounted(true)
    setDemoSession(getStored<DemoSession>(STORAGE_KEYS.session, ANON))
    setProfile(loadProfile(mockProfile))
    setRecords(getStored(STORAGE_KEYS.records, mockRecords))
    setConsents(getStored(STORAGE_KEYS.consents, mockConsents))
    setAudit(getStored(STORAGE_KEYS.audit, mockAudit))
    setQr(getStored(STORAGE_KEYS.qr, mockEmergencyQR))
    setNotifications(getStored(STORAGE_KEYS.notifications, mockNotifications))
    const storedSettings = getStored<AppSettings>(STORAGE_KEYS.settings, mockSettings)
    setSettings(storedSettings)
    setQrToken(getCurrentQrToken())
    // Master switch: respect the Settings → Automations toggle.
    setN8nEmissionEnabled(storedSettings.n8nEnabled !== false)
  }, [])

  // Persist only real user changes (the old code wrote on every render).
  useEffect(() => { if (mounted) setStored(STORAGE_KEYS.profile, profile) }, [profile, mounted])
  useEffect(() => { if (mounted) setStored(STORAGE_KEYS.records, records) }, [records, mounted])
  useEffect(() => { if (mounted) setStored(STORAGE_KEYS.consents, consents) }, [consents, mounted])
  useEffect(() => { if (mounted) setStored(STORAGE_KEYS.audit, audit) }, [audit, mounted])
  useEffect(() => { if (mounted) setStored(STORAGE_KEYS.qr, qr) }, [qr, mounted])
  useEffect(() => { if (mounted) setStored(STORAGE_KEYS.settings, settings) }, [settings, mounted])

  const showToast = (message: string) => {
    setToast(message)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(""), 3000)
  }

  const emit = (event: string, source: string, payload: Record<string, unknown>) => {
    void emitN8nEvent({ event, source, payload })
  }

  const updateSetting = (key: keyof AppSettings) => {
    const next = { ...settings, [key]: !settings[key] }
    setSettings(next)
    setN8nEmissionEnabled(next.n8nEnabled !== false)
    emit("settings.updated", "settings-page", { setting: key, enabled: next[key] })
    if (key === "n8nEnabled") showToast(next.n8nEnabled ? "Automations enabled" : "Automations paused — events will be dropped")
    else showToast("Preference saved — workflow notified")
  }

  const addAudit = (action: string, actor = "You", status: AuditEvent["status"] = "AUTHORIZED") => {
    setAudit((items) => [{ id: `audit-${Date.now()}`, actor, action, time: "Just now", status }, ...items])
    emit("audit.event", "patient-app", { actor, action })
  }

  const authed = demoSession.authenticated || Boolean(authSession?.user)
  const email = authSession?.user?.email || demoSession.email || "sandhiya@example.com"

  const login = (mail: string) => {
    const next = { authenticated: true, email: mail }
    setDemoSession(next)
    setStored(STORAGE_KEYS.session, next)
    emit("auth.signed_in", "demo-auth", { email: mail })
    addAudit("Signed in to health wallet", mail.split("@")[0])
  }

  const signOut = async () => {
    emit("auth.signed_out", "patient-app", { email })
    setDemoSession(ANON)
    setStored(STORAGE_KEYS.session, ANON)
    try { await authClient.signOut() } catch { /* demo mode has no backend session */ }
    setView("dashboard")
  }

  const regenerateQR = () => {
    const token = revokeQrToken()
    setQr({ id: `qr-${Date.now().toString(36)}`, status: "ACTIVE", updatedAt: new Date().toLocaleString(), sharedItems: mockEmergencyQR.sharedItems })
    setQrToken(token)
    emit("qr.revoked", "emergency-page", { reason: "regenerated" })
    emit("qr.generated", "emergency-page", { tokenPrefix: token.slice(0, 8) })
    addAudit("Emergency QR regenerated — previous token revoked", "You")
    showToast("New secure QR issued — previous token revoked")
  }

  const downloadQR = () => {
    const canvas = qrRef.current
    if (!canvas) return
    const link = document.createElement("a")
    link.download = "RESQNOW-Emergency-QR.png"
    link.href = canvas.toDataURL("image/png")
    link.click()
    emit("emergency.shared", "emergency-page", { method: "download", qrId: qr.id })
    addAudit("Emergency QR downloaded", "You")
    showToast("Emergency QR downloaded — workflow notified")
  }

  const printQR = () => {
    emit("emergency.shared", "emergency-page", { method: "print", qrId: qr.id })
    addAudit("Emergency QR printed", "You")
    window.print()
  }

  const openEmergency = () => {
    setView("emergency")
    if (!audit.some((event) => event.action === "Emergency profile accessed" && event.time === "Just now")) {
      addAudit("Emergency profile accessed", "Emergency Care Team")
      emit("emergency.access", "emergency-page", { patient: profile.name, bloodGroup: profile.bloodGroup })
    }
  }

  const resetDemo = () => {
    const keepSession = demoSession
    resetStored()
    setStored(STORAGE_KEYS.session, keepSession)
    setProfile(mockProfile); setRecords(mockRecords); setConsents(mockConsents)
    setAudit(mockAudit); setQr(mockEmergencyQR); setNotifications(mockNotifications); setSettings(mockSettings)
    setN8nEmissionEnabled(true)
    clearRuns()
    showToast("Demo state reset")
  }

  const filtered = useMemo(
    () => records.filter((item) => `${item.title} ${item.provider} ${item.type}`.toLowerCase().includes(query.toLowerCase())),
    [records, query],
  )

  if (!mounted || authPending) {
    return (
      <main className="auth-page">
        <section className="card auth-card">
          <div className="auth-heading">
            <div className="eyebrow">SECURE SESSION</div>
            <h1>Loading your health wallet.</h1>
            <p>Verifying your secure session…</p>
          </div>
        </section>
      </main>
    )
  }
  if (!authed) return <Auth onLogin={login} />

  return (
    <div className="app-shell">
      <aside className={menu ? "sidebar open" : "sidebar"}>
        <div className="sidebar-top">
          <div className="logo"><span className="logo-mark"><HeartPulse size={17} /></span>RESQ<span className="logo-accent">NOW</span></div>
          <span className="demo-badge">LIVE</span>
        </div>
        <div className="workspace">
          <span className="avatar">SP</span>
          <span><b>{profile.name}</b><small>Personal health wallet</small></span>
        </div>
        <nav>
          {nav.map(({ id, label, icon: Icon }) => (
            <button key={id} className={view === id ? "nav-item active" : "nav-item"} onClick={() => { id === "emergency" ? openEmergency() : setView(id as ViewId); setMenu(false) }}>
              <Icon size={17} />{label}{id === "workflows" && <i className="nav-ping" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setView("settings")}><SettingsIcon size={17} />Settings</button>
          <button className="nav-item" onClick={signOut}>Sign out</button>
          <div className="security-note">
            <ShieldCheck size={18} />
            <span><strong>Consent controlled</strong><small>Limited access by design</small></span>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Open navigation" onClick={() => setMenu(!menu)}><Menu size={20} /></button>
          <div className="top-search">
            <Search size={16} />
            <input aria-label="Search records" placeholder="Search your health records…" value={query} onChange={(event) => { setQuery(event.target.value); if (event.target.value) setView("records") }} />
          </div>
          <button className="icon-button" aria-label="Mark notifications read" onClick={() => { setNotifications(notifications.map((item) => ({ ...item, read: true }))); showToast("Notifications marked as read") }}>
            <Bell size={18} />{notifications.some((item) => !item.read) && <i />}
          </button>
          <span className="avatar">{initials(profile.name)}</span>
        </header>

        <AnimatePresence mode="wait">
          <motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="content">
            <View
              view={view} profile={profile} setProfile={setProfile} records={filtered} consents={consents} setConsents={setConsents}
              audit={audit} qr={qr} qrToken={qrToken} qrRef={qrRef} onEmergency={openEmergency} onRegenerate={regenerateQR} onDownload={downloadQR}
              onPrint={printQR} onReset={resetDemo} showToast={showToast} addAudit={addAudit} emit={emit} setView={setView}
              setRecords={setRecords} settings={settings} updateSetting={updateSetting} providers={mockProviders}
            />
            <button className="start-demo" onClick={() => setTourStep(0)}><Play size={14} /> Start Demo</button>
          </motion.div>
        </AnimatePresence>
      </main>

      {toast && <div className="toast"><Check size={16} />{toast}</div>}
      {tourStep >= 0 && <Tour step={tourStep} onNext={() => (tourStep >= tour.length - 1 ? setTourStep(-1) : setTourStep(tourStep + 1))} onClose={() => setTourStep(-1)} />}
    </div>
  )
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()
}

function Auth({ onLogin }: { onLogin: (email: string) => void }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  return (
    <main className="auth-page with-visual">
      <div className="auth-brand"><span className="logo-mark"><HeartPulse size={17} /></span>RESQ<span className="logo-accent">NOW</span></div>
      <section className="card auth-card">
        <div className="auth-heading">
          <div className="eyebrow">YOUR HEALTH WALLET</div>
          <h1>Welcome back</h1>
          <p>The right health information, at the right time.</p>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); if (email && password.length >= 6) onLogin(email || "sandhiya@example.com") }}>
          <label>Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
          <label>Password<input required minLength={6} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="6+ characters" /></label>
          <button className="primary auth-submit">Sign in <ArrowRight size={16} /></button>
        </form>
        <p className="auth-foot">Any valid email and a 6+ character password signs you in.</p>
        <div className="auth-trust"><ShieldCheck size={14} /> Secure · Verified · Consent controlled · Automated</div>
      </section>
      <section className="auth-visual" aria-hidden>
        <img src={HERO_IMAGE} alt="" />
        <div className="auth-visual-card card">
          <span className="eyebrow">LIVE AUTOMATION</span>
          <strong>{N8N_WORKFLOWS.length} automations</strong>
          <small>Emergency packets, consent lifecycle, audit trails and notifications run automatically.</small>
        </div>
      </section>
    </main>
  )
}

interface ViewProps {
  view: ViewId
  profile: PatientProfile
  setProfile: (profile: PatientProfile) => void
  setRecords: (updater: (items: MedicalRecord[]) => MedicalRecord[]) => void
  settings: AppSettings
  updateSetting: (key: keyof AppSettings) => void
  providers: Provider[]
  records: MedicalRecord[]
  consents: Consent[]
  setConsents: (updater: (items: Consent[]) => Consent[]) => void
  audit: AuditEvent[]
  qr: EmergencyQR
  qrToken: string
  qrRef: React.RefObject<HTMLCanvasElement | null>
  onEmergency: () => void
  onRegenerate: () => void
  onDownload: () => void
  onPrint: () => void
  onReset: () => void
  showToast: (message: string) => void
  addAudit: (action: string, actor?: string, status?: AuditEvent["status"]) => void
  emit: (event: string, source: string, payload: Record<string, unknown>) => void
  setView: (view: ViewId) => void
}

function View(props: ViewProps) {
  const { view } = props
  if (view === "profile") return <Profile profile={props.profile} setProfile={props.setProfile} showToast={props.showToast} emit={props.emit} />
  if (view === "records") return <Records records={props.records} setRecords={props.setRecords} addAudit={props.addAudit} emit={props.emit} showToast={props.showToast} />
  if (view === "share") return <Share consents={props.consents} setConsents={props.setConsents} addAudit={props.addAudit} emit={props.emit} showToast={props.showToast} providers={props.providers} />
  if (view === "history") return <History audit={props.audit} />
  if (view === "workflows") return <WorkflowsPage />
  if (view === "emergency") return <Emergency profile={props.profile} qr={props.qr} qrToken={props.qrToken} qrRef={props.qrRef} onRegenerate={props.onRegenerate} onDownload={props.onDownload} onPrint={props.onPrint} />
  if (view === "settings") return <Settings settings={props.settings} onToggle={props.updateSetting} onReset={props.onReset} />
  if (view === "doctor") return <Doctor profile={props.profile} consents={props.consents} addAudit={props.addAudit} emit={props.emit} />
  return <Dashboard profile={props.profile} records={props.records} consents={props.consents} audit={props.audit} onEmergency={props.onEmergency} setView={props.setView} />
}

function Header({ eyebrow, title, body, action }: { eyebrow: string; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="page-header">
      <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{body}</p></div>
      {action}
    </div>
  )
}

function Dashboard({ profile, records, consents, audit, onEmergency, setView }: { profile: PatientProfile; records: MedicalRecord[]; consents: Consent[]; audit: AuditEvent[]; onEmergency: () => void; setView: (view: ViewId) => void }) {
  // Quick links above the stats connect the wallet to the Emergency Center,
  // document processing and access-request approval surfaces.
  const runs = getRuns()
  return (
    <div className="dashboard-view">
      <Header
        eyebrow="YOUR HEALTH WALLET"
        title={`Good morning, ${profile.name.split(" ")[0]}`}
        body="Your health information is organized, verified, and always within reach."
        action={<button className="outline" onClick={onEmergency}><QrCode size={16} />Emergency QR</button>}
      />
      <div className="quick-grid">
        {quickLinks.map(({ href, label, icon: Icon, tone }) => (
          <a className="card stat-card" key={href} href={href}>
            <span className={`stat-icon ${tone}`}><Icon /></span>
            <div><small>Open</small><strong>{label}</strong></div>
          </a>
        ))}
      </div>
      <div className="grid-3">
        <Stat icon={<ShieldCheck />} label="Verified records" value={records.filter((item) => item.status === "VERIFIED").length} note="All records verified" tone="mint" />
        <Stat icon={<Users />} label="Active consent" value={consents.filter((item) => item.status === "ACTIVE").length} note="Patient controlled" tone="blue" />
        <Stat icon={<Workflow />} label="Automations" value={`${N8N_WORKFLOWS.filter((wf) => wf.active).length} active`} note={`${runs.length} runs logged`} tone="peach" />
      </div>
      <div className="section-grid">
        <section className="card panel">
          <div className="panel-heading">
            <div><h2>Recent activity</h2><p>Stay informed about your health information.</p></div>
            <button className="text-button" onClick={() => setView("history")}>View history <ChevronRight size={14} /></button>
          </div>
          {audit.slice(0, 3).map((item) => (
            <div className="activity-row" key={item.id}>
              <span className="timeline-dot"><Activity size={14} /></span>
              <div><strong>{item.action}</strong><small>{item.actor} · {item.time}</small></div>
            </div>
          ))}
        </section>
        <section className="card emergency-card">
          <div className="eyebrow">EMERGENCY READY</div>
          <h2>Your critical profile is ready.</h2>
          <p>Scanning the QR triggers the emergency workflow that delivers a read-only responder packet and alerts your contact.</p>
          <button className="light-button" onClick={onEmergency}><QrCode size={16} />Open emergency QR</button>
          <div className="emergency-meta"><ShieldCheck size={15} /> Limited access by design</div>
        </section>
      </div>
      <section className="impact-strip">
        <div><strong>Verified Health Profile</strong><span>One trusted source of truth</span></div>
        <div><strong>Patient-Controlled Consent</strong><span>Share only what is needed</span></div>
        <div><strong>Automated Coordination</strong><span>Workflows respond in real time</span></div>
      </section>
    </div>
  )
}

function Stat({ icon, label, value, note, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; note: string; tone: string }) {
  return <div className="card stat-card"><span className={`stat-icon ${tone}`}>{icon}</span><div><small>{label}</small><strong>{value}</strong><em>{note}</em></div></div>
}

function Profile({ profile, setProfile, showToast, emit }: { profile: PatientProfile; setProfile: (profile: PatientProfile) => void; showToast: (message: string) => void; emit: ViewProps["emit"] }) {
  const [draft, setDraft] = useState(profile)
  const [editing, setEditing] = useState(false)
  const fields: [string, keyof PatientProfile][] = [
    ["Full name", "name"], ["Date of birth", "dob"], ["Blood group", "bloodGroup"], ["Emergency contact", "emergencyContact"],
    ["Allergies", "allergies"], ["Critical medication", "medications"], ["Critical condition", "conditions"], ["Procedures", "procedures"],
  ]
  const listKeys: (keyof PatientProfile)[] = ["allergies", "medications", "conditions", "procedures"]
  return (
    <>
      <Header
        eyebrow="VERIFIED HEALTH PROFILE" title="Health profile" body="Keep your critical information accurate and ready to share."
        action={<button className="primary" onClick={() => {
          if (editing) { setProfile(draft); showToast("Profile saved"); emit("record.updated", "profile-page", { recordTitle: "Health profile" }) }
          setEditing(!editing)
        }}>{editing ? <><Check size={16} />Save changes</> : "Edit profile"}</button>}
      />
      <div className="card profile-card">
        <div className="profile-hero">
          <span className="profile-avatar">{initials(profile.name)}</span>
          <div><h2>{profile.name}</h2><p>Identity verified · Last updated today</p></div>
          <ShieldCheck className="verified" />
        </div>
        <div className="profile-fields">
          {fields.map(([label, key]) => (
            <label key={key}>{label}
              {editing ? (
                <input value={Array.isArray(draft[key]) ? draft[key].join(", ") : String(draft[key])} onChange={(event) => setDraft({ ...draft, [key]: listKeys.includes(key) ? event.target.value.split(",").map((s) => s.trim()) : event.target.value })} />
              ) : (
                <strong>{Array.isArray(profile[key]) ? profile[key].join(", ") : String(profile[key])}</strong>
              )}
            </label>
          ))}
        </div>
      </div>
    </>
  )
}

function Records({ records, setRecords, addAudit, emit, showToast }: { records: MedicalRecord[]; setRecords: ViewProps["setRecords"]; addAudit: ViewProps["addAudit"]; emit: ViewProps["emit"]; showToast: (message: string) => void }) {
  const openRecord = (record: MedicalRecord) => {
    addAudit(`Viewed ${record.title}`)
    emit("record.viewed", "records-page", { recordId: record.id, recordTitle: record.title, provider: record.provider })
    emit("notify.access", "record-workflow", { actor: "You", action: `Viewed ${record.title}` })
    showToast("Record opened — notification workflow triggered")
  }
  const addRecord = () => {
    const id = `record-${Date.now().toString(36)}`
    const newRecord: MedicalRecord = {
      id, title: "New upload", provider: "Unassigned", date: new Date().toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }),
      type: "Lab Reports", status: "PENDING", data: "Awaiting verification workflow…",
    }
    setRecords((items) => [newRecord, ...items])
    emit("record.added", "records-page", { recordId: id, recordTitle: newRecord.title, provider: newRecord.provider })
    addAudit("Record uploaded — verification workflow started", "You")
    showToast("Upload queued — verification workflow running")
    // The "workflow" completes asynchronously: verifies the record and fires the fan-out.
    window.setTimeout(() => {
      setRecords((items) => items.map((item) => item.id === id ? { ...item, status: "VERIFIED", data: "Signature and metadata checks passed." } : item))
      emit("record.verified", "record-workflow", { recordId: id, recordTitle: newRecord.title })
      emit("notify.access", "notification-router", { actor: "Automation", action: `Verification completed for ${newRecord.title}` })
      addAudit(`Verification completed — ${newRecord.title}`, "Verification workflow")
      showToast("n8n verified your new record")
    }, 3500)
  }
  return (
    <>
      <Header eyebrow="VERIFIED RECORDS" title="Medical records" body="Your visits, labs, prescriptions, and documents in one secure place."
        action={<button className="primary" onClick={addRecord}><FileText size={16} />Add record</button>} />
      <div className="card records-panel">
        {records.map((record) => (
          <button className="record-row" key={record.id} onClick={() => openRecord(record)}>
            <span className="record-icon"><FileText size={17} /></span>
            <span className="record-info">
              <strong>{record.title}</strong>
              <small>{record.type} · {record.provider}{record.data ? ` · ${record.data}` : ""}</small>
            </span>
            <span className="record-date">{record.date}</span>
            {record.status === "VERIFIED" ? <Check size={15} className="verified" /> : <span className="muted-pill">PENDING</span>}
            <ChevronRight size={16} />
          </button>
        ))}
      </div>
    </>
  )
}

function Share({ consents, setConsents, addAudit, emit, showToast, providers }: { consents: Consent[]; setConsents: ViewProps["setConsents"]; addAudit: ViewProps["addAudit"]; emit: ViewProps["emit"]; showToast: (message: string) => void; providers: Provider[] }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [providerId, setProviderId] = useState(providers[0]?.id ?? "")
  const [purpose, setPurpose] = useState("Consultation")
  const [scopes, setScopes] = useState<string[]>(["Allergies", "Medications"])
  const availableScopes = ["Allergies", "Medications", "Conditions", "Lab Reports", "Prescriptions", "Discharge Summaries"]
  const toggleScope = (scope: string) => setScopes((items) => items.includes(scope) ? items.filter((item) => item !== scope) : [...items, scope])
  const grant = () => {
    const provider = providers.find((item) => item.id === providerId)
    if (!provider || scopes.length === 0) { showToast("Pick a provider and at least one data scope"); return }
    const consent: Consent = {
      id: `consent-${Date.now().toString(36)}`, providerId: provider.id, providerName: provider.name, facility: provider.facility,
      selectedData: scopes, purpose, createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), status: "ACTIVE",
    }
    setConsents((items) => [consent, ...items])
    emit("consent.granted", "share-page", { providerName: provider.name, purpose, scopes })
    addAudit(`Consent granted — ${provider.name}`)
    emit("notify.access", "n8n-consent-workflow", { actor: provider.name, action: "New consent granted" })
    setModalOpen(false)
    showToast("Access granted — consent lifecycle workflow running")
  }
  return (
    <>
      <Header eyebrow="PATIENT-CONTROLLED CONSENT" title="Consent & sharing" body="You decide who can access your health information and why."
        action={<button className="primary" onClick={() => setModalOpen(true)}>Share access</button>} />
      <div className="card panel">
        <div className="panel-heading">
          <div><h2>Active permissions</h2><p>RESQNOW only exposes the information necessary for the approved purpose.</p></div>
          <ShieldCheck className="verified" />
        </div>
        {consents.map((item) => (
          <div className="consent-row" key={item.id}>
            <span className="provider-icon"><Stethoscope size={18} /></span>
            <div>
              <strong>{item.providerName}</strong>
              <small>{item.purpose} · {item.selectedData.join(", ")} · expires {item.expiresAt.slice(0, 10)}</small>
            </div>
            <span className={`status-pill ${item.status === "ACTIVE" ? "" : "revoked"}`}>{item.status}</span>
            {item.status === "ACTIVE" && (
              <button className="danger-link" onClick={() => {
                setConsents((items) => items.map((consent) => consent.id === item.id ? { ...consent, status: "REVOKED" } : consent))
                emit("consent.revoked", "share-page", { providerName: item.providerName, purpose: item.purpose, scopes: item.selectedData })
                addAudit(`Consent revoked — ${item.providerName}`)
                showToast("Access revoked — n8n workflow cutting provider access")
              }}>Revoke</button>
            )}
          </div>
        ))}
      </div>
      {modalOpen && (
        <div className="modal-backdrop">
          <div className="modal card">
            <button className="modal-close" aria-label="Close" onClick={() => setModalOpen(false)}><X size={19} /></button>
            <span className="section-label">SHARE ACCESS</span>
            <h2>Grant consent</h2>
            <p className="modal-copy">The consent lifecycle workflow validates the window, notifies the provider and schedules expiry.</p>
            <div className="edit-grid">
              <label>Provider
                <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
                  {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} · {provider.role}</option>)}
                </select>
              </label>
              <label>Purpose
                <select value={purpose} onChange={(event) => setPurpose(event.target.value)}>
                  {["Consultation", "Emergency care", "Diagnostic testing", "Second opinion"].map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
            </div>
            <strong className="modal-sublabel">Data to share</strong>
            <div className="check-options">
              {availableScopes.map((scope) => (
                <label key={scope}><input type="checkbox" checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} /> {scope}</label>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn subtle" onClick={() => setModalOpen(false)}>Cancel</button>
              <button className="btn primary" onClick={grant}><ShieldCheck size={16} /> Grant access</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function History({ audit }: { audit: AuditEvent[] }) {
  return (
    <>
      <Header eyebrow="TRANSPARENCY" title="Access history" body="See when your information was viewed, shared, or accessed in an emergency." />
      <div className="card panel">
        {audit.map((item) => (
          <div className="activity-row" key={item.id}>
            <span className="timeline-dot"><Clock3 size={14} /></span>
            <div><strong>{item.action}</strong><small>{item.actor} · {item.time}</small></div>
            <span className="status-pill">{item.status}</span>
          </div>
        ))}
      </div>
    </>
  )
}

function Emergency({ profile, qr, qrToken, qrRef, onRegenerate, onDownload, onPrint }: { profile: PatientProfile; qr: EmergencyQR; qrToken: string; qrRef: React.RefObject<HTMLCanvasElement | null>; onRegenerate: () => void; onDownload: () => void; onPrint: () => void }) {
  return (
    <>
      <Header eyebrow="EMERGENCY MODE" title="Emergency QR" body="Only critical information is displayed. Scanning triggers the responder workflow."
        action={<span className="status-pill">{qr.status}</span>} />
      <div className="emergency-layout">
        <section className="card qr-card">
          <div className="qr-frame">
            <QRCodeCanvas ref={qrRef} value={typeof window !== "undefined" ? `${window.location.origin}/emergency-access?t=${qrToken}` : ""} size={210} level="H" />
          </div>
          <h2>Emergency Health Profile</h2>
          <p>Scan to access a safe, read-only emergency route.</p>
          <div className="qr-actions">
            <button className="primary" onClick={onRegenerate}><QrCode size={16} />Regenerate QR</button>
            <button className="outline" onClick={onDownload}><Download size={16} />Download</button>
            <button className="outline" onClick={onPrint}><Printer size={16} />Print</button>
          </div>
          <small className="qr-id">Secure token · {qrToken.slice(0, 12)}… — the QR contains no medical data</small>
        </section>
        <section className="card panel emergency-only">
          <div className="eyebrow">CRITICAL INFORMATION ONLY</div>
          {([["Blood group", profile.bloodGroup], ["Allergies", profile.allergies.join(", ")], ["Critical medication", profile.medications.join(", ")], ["Critical condition", profile.conditions.join(", ")], ["Emergency contact", profile.emergencyContact]] as const).map(([label, value]) => (
            <div className="critical-item" key={label}><small>{label}</small><strong>{value}</strong></div>
          ))}
          <div className="emergency-meta"><ShieldCheck size={15} /> Limited access · Emergency Care Team</div>
        </section>
      </div>
    </>
  )
}

function Settings({ settings, onToggle, onReset }: { settings: AppSettings; onToggle: (key: keyof AppSettings) => void; onReset: () => void }) {
  return (
    <>
      <Header eyebrow="PREFERENCES" title="Settings" body="Manage your wallet preferences and demo state." />
      <div className="card panel settings-card">
        <div className="setting-row"><div><strong>Demo mode</strong><p>Complete fictional data is loaded for this presentation.</p></div><button className={`toggle ${settings.demoMode ? "on" : ""}`} onClick={() => onToggle("demoMode")} aria-pressed={settings.demoMode}><span /></button></div>
        <div className="setting-row"><div><strong>Access notifications</strong><p>Alerts fire through the n8n fan-out workflow.</p></div><button className={`toggle ${settings.notificationsEnabled ? "on" : ""}`} onClick={() => onToggle("notificationsEnabled")} aria-pressed={settings.notificationsEnabled}><span /></button></div>
        <div className="setting-row"><div><strong>Emergency profile</strong><p>Keep your limited emergency QR profile available.</p></div><button className={`toggle ${settings.emergencyProfileEnabled ? "on" : ""}`} onClick={() => onToggle("emergencyProfileEnabled")} aria-pressed={settings.emergencyProfileEnabled}><span /></button></div>
        <div className="setting-row"><div><strong>Automations</strong><p>Master switch. When off, every event from this wallet is dropped before it reaches the gateway.</p></div><button className={`toggle ${settings.n8nEnabled ? "on" : ""}`} onClick={() => onToggle("n8nEnabled")} aria-pressed={settings.n8nEnabled}><span /></button></div>
        <div className="setting-row"><div><strong>Reset Demo</strong><p>Restore the full RESQNOW demo state and clear the run log.</p></div><button className="outline" onClick={onReset}>Reset demo</button></div>
      </div>
    </>
  )
}

function Doctor({ profile, consents, addAudit, emit }: { profile: PatientProfile; consents: Consent[]; addAudit: ViewProps["addAudit"]; emit: ViewProps["emit"] }) {
  const activeConsent = consents.find((item) => item.status === "ACTIVE")
  const requestAccess = async () => {
    const providerName = activeConsent?.providerName ?? "Dr. Priya Shah (City General Hospital)"
    const scopes = activeConsent?.selectedData ?? ["Medications", "Lab Reports"]
    await fetch("/api/access-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request", providerName, purpose: "Consultation", scopes, durationMinutes: 30 }),
    })
    void emitN8nEvent({ event: "access.requested", source: "doctor-portal", payload: { providerName, purpose: "Consultation", scopes } })
  }
  return (
    <>
      <Header eyebrow="PROVIDER PORTAL" title="Doctor view" body="Only approved information is visible to this care team."
        action={<button className="outline" onClick={() => void requestAccess()}><Stethoscope size={16} />Request data access</button>} />
      <div className="card panel">
        <div className="profile-hero">
          <span className="profile-avatar">{initials(profile.name)}</span>
          <div><h2>{profile.name}</h2><p>Access purpose: {activeConsent?.purpose ?? "No active consent"}</p></div>
          <span className={`status-pill ${activeConsent ? "" : "revoked"}`}>{activeConsent ? "Limited access" : "NO ACTIVE CONSENT"}</span>
        </div>
        <div className="provider-access">
          <strong>Approved data</strong>
          {(activeConsent?.selectedData ?? []).map((item) => <span key={item}><Check size={14} />{item}</span>)}
        </div>
        <p className="security-copy"><ShieldCheck size={15} /> Consent controlled · Every provider access fires the audit + fan-out workflows.</p>
      </div>
    </>
  )
}

function WorkflowsPage() {
  const [runs, setRuns] = useState<N8nRun[]>([])
  const [gatewayEvents, setGatewayEvents] = useState<N8nGatewayEvent[]>([])
  const [ping, setPing] = useState<{ ok: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)
  useEffect(() => {
    setRuns(getRuns())
    setGatewayEvents([])
    const poll = () => { void fetchGatewayEvents().then(setGatewayEvents) }
    poll()
    const timer = window.setInterval(poll, 4000)
    return () => window.clearInterval(timer)
  }, [])
  const test = async () => {
    setTesting(true)
    setPing(await pingGateway())
    setRuns(getRuns())
    setTesting(false)
  }
  return (
    <>
      <Header
        eyebrow="AUTOMATION BACKBONE" title="Automations" body="Every wallet action streams through the automation engine — processing, verification, emergency coordination and notifications run themselves."
        action={<button className="primary" onClick={test} disabled={testing}><Radio size={16} />{testing ? "Testing…" : "Test gateway"}</button>}
      />
      <div className="workflow-banner card">
        <div>
          <div className="eyebrow">WEBHOOK GATEWAY</div>
          <strong>POST {n8nGatewayUrl()}</strong>
          <small>The app delivers every event here; the server forwards to the connected automation engine with retry. Connection status appears when you press “Test gateway”.</small>
        </div>
        <CopyButton />
      </div>
      {ping && <div className={`workflow-ping ${ping.ok ? "ok" : "bad"}`}><Radio size={14} />{ping.message}</div>}
      <div className="workflows-grid">
        {N8N_WORKFLOWS.map((wf) => (
          <section className="card workflow-card" key={wf.id}>
            <div className="workflow-top">
              <span className="workflow-icon"><Workflow size={18} /></span>
              <span className="status-pill">{wf.active ? "ACTIVE" : "PAUSED"}</span>
            </div>
            <h3>{wf.name}</h3>
            <p>{wf.description}</p>
            <div className="workflow-meta"><small>TRIGGER</small><span>{wf.trigger}</span></div>
            <div className="workflow-meta"><small>FILE</small><span>{wf.file}</span></div>
            <div className="workflow-tags">{wf.wiredTo.map((target) => <span key={target}>{target}</span>)}</div>
          </section>
        ))}
      </div>
      <section className="card panel runlog">
        <div className="panel-heading">
          <div><h2>Workflow run log</h2><p>Local run log — live executions appear here when n8n is connected.</p></div>
          <button className="text-button" onClick={() => { clearRuns(); setRuns([]) }}>Clear log</button>
        </div>
        {runs.length === 0 && <p className="runlog-empty">No runs yet — open a record, revoke a consent, or scan the emergency QR to fire a workflow event.</p>}
        {runs.map((run) => (
          <div className="activity-row" key={run.id}>
            <span className={`timeline-dot run-${run.status}`}><Activity size={14} /></span>
            <div><strong>{run.workflowName}</strong><small>{run.trigger} · {run.startedAt} · {run.durationMs}ms · {run.detail}</small></div>
            <span className={`status-pill ${run.status === "success" ? "" : run.status === "error" ? "revoked" : ""}`}>{run.status.toUpperCase()}</span>
          </div>
        ))}
      </section>
      <section className="card panel runlog">
        <div className="panel-heading">
          <div><h2>Gateway event stream</h2><p>Server-side view of events passing through the gateway — exactly what n8n receives. Auto-refreshes.</p></div>
          <span className="muted-pill">{gatewayEvents.length} events</span>
        </div>
        {gatewayEvents.length === 0 && <p className="runlog-empty">No gateway traffic yet — interact with the wallet or press “Test gateway”.</p>}
        {gatewayEvents.map((entry) => (
          <div className="activity-row" key={entry.id}>
            <span className="timeline-dot run-success"><Radio size={14} /></span>
            <div>
              <strong>{entry.event}</strong>
              <small>{entry.source} · {new Date(entry.receivedAt).toLocaleTimeString()} · {entry.kind}{entry.forwarded ? " · forwarded to n8n" : " · demo mode"}</small>
            </div>
            <span className={`status-pill ${entry.forwarded ? "" : "muted"}`}>{entry.forwarded ? "LIVE" : "DEMO"}</span>
          </div>
        ))}
      </section>
    </>
  )
}

function CopyButton() {
  const [copied, setCopied] = useState(false)
  return (
    <button className="outline" onClick={async () => {
      try { await navigator.clipboard.writeText(`${window.location.origin}${n8nGatewayUrl()}`); setCopied(true); window.setTimeout(() => setCopied(false), 2000) } catch { /* clipboard unavailable */ }
    }}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy URL"}</button>
  )
}

function Tour({ step, onNext, onClose }: { step: number; onNext: () => void; onClose: () => void }) {
  const labels = ["Dashboard", "Verified Health Profile", "Medical Records", "Consent & Sharing", "Access History", "n8n Workflows", "Emergency QR", "Doctor View"]
  return (
    <div className="tour-card">
      <button aria-label="Close demo" onClick={onClose}><X size={16} /></button>
      <span className="eyebrow">GUIDED DEMO · {step + 1}/{labels.length}</span>
      <h3>{labels[step]}</h3>
      <p>Explore how RESQNOW keeps health information verified, consent controlled, and automated with n8n.</p>
      <button className="primary" onClick={onNext}>{step === labels.length - 1 ? "Finish demo" : "Next"}<ArrowRight size={15} /></button>
    </div>
  )
}

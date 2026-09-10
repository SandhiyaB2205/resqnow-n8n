import Link from "next/link"
import {
  Activity, ArrowRight, BellRing, FileCheck2, HeartPulse, QrCode, ShieldCheck, Siren, Workflow,
} from "lucide-react"

const HERO_IMAGE = process.env.NEXT_PUBLIC_HERO_IMAGE_URL || "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=1600&q=80"
const WARD_IMAGE = process.env.NEXT_PUBLIC_WARD_IMAGE_URL || "https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=1200&q=80"

const workflows = [
  { icon: Siren, name: "Emergency responder packet", detail: "A QR scan triggers the emergency workflow, assembles the critical profile and alerts the emergency contact in seconds." },
  { icon: ShieldCheck, name: "Consent lifecycle", detail: "Grants, expiries and revocations propagate automatically — providers lose access the moment you revoke." },
  { icon: FileCheck2, name: "Record verification", detail: "Uploads flow through a verification pipeline that checks metadata and flips records to VERIFIED." },
  { icon: BellRing, name: "Access fan-out", detail: "Every provider access fans out into in-app alerts, digests and an immutable audit trail." },
]

export default function LandingPage() {
  return (
    <main className="landing">
      <nav className="landing-nav">
        <div className="logo"><span className="logo-mark"><HeartPulse size={17} /></span>RESQ<span className="logo-accent">NOW</span></div>
        <div className="landing-links">
          <a href="#workflows">Workflows</a>
          <a href="#security">Security</a>
          <a href="#emergency">Emergency</a>
        </div>
        <div className="landing-cta">
          <Link className="login-link" href="/login">Log in</Link>
          <Link className="btn primary" href="/signup">Create wallet <ArrowRight size={15} /></Link>
        </div>
      </nav>

      <header className="landing-hero">
        <div className="hero-copy">
          <span className="eyebrow">PATIENT-CONTROLLED HEALTH WALLET</span>
          <h1>The right health information, <em>at the right time.</em></h1>
          <p>
            RESQNOW keeps your verified records, consent rules and critical profile in one wallet —
            and an automation backbone reacts the instant something happens.
          </p>
          <div className="hero-actions">
            <Link className="btn primary" href="/login">Open your wallet <ArrowRight size={16} /></Link>
            <Link className="outline-link" href="/emergency-access"><QrCode size={16} /> Try an emergency scan</Link>
          </div>
          <div className="hero-proof">
            <span><ShieldCheck size={15} />Consent controlled</span>
            <span><Activity size={15} />Audited access</span>
            <span><Workflow size={15} />Automated</span>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-photo">
            <img src={HERO_IMAGE} alt="Modern hospital building with emergency entrance" />
            <div className="hero-photo-tag"><Siren size={14} /> Emergency-ready · 24/7</div>
          </div>
          <div className="flow-pill flow-one"><span className="flow-icon teal"><QrCode size={15} /></span><span><small>QR scan</small><strong>workflow fires</strong></span></div>
          <div className="flow-pill flow-two"><span className="flow-icon amber"><BellRing size={15} /></span><span><small>Automation</small><strong>contact alerted</strong></span></div>
          <div className="flow-pill flow-three"><span className="flow-icon"><ShieldCheck size={15} /></span><span><small>Access</small><strong>logged & audited</strong></span></div>
        </div>
      </header>

      <section className="landing-section" id="workflows">
        <span className="eyebrow">AUTOMATION BACKBONE</span>
        <h2>Workflows that act the moment you can't.</h2>
        <p className="section-intro">Purpose-built automations power the wallet: responder packets, consent lifecycle, verification and notification fan-out.</p>
        <div className="workflows-grid">
          {workflows.map(({ icon: Icon, name, detail }) => (
            <section className="card workflow-card" key={name}>
              <div className="workflow-top"><span className="workflow-icon"><Icon size={18} /></span><span className="status-pill">ACTIVE</span></div>
              <h3>{name}</h3>
              <p>{detail}</p>
            </section>
          ))}
        </div>
        <p className="section-note">Import the JSON files from <code>/workflows</code> — triggers, filters and routes come pre-wired to the gateway.</p>
      </section>

      <section className="landing-feature">
        <div>
          <span className="eyebrow">DESIGNED FOR REAL WARDS</span>
          <h2>Built with emergency rooms in mind.</h2>
          <p>
            First responders scan one QR and get exactly what they need — blood group, allergies,
            medications, conditions and your contact — nothing more, logged every time.
          </p>
          <Link className="btn white" href="/emergency-access">Preview the responder view <ArrowRight size={15} /></Link>
        </div>
        <div className="consent-visual">
          <div className="ward-photo">
            <img src={WARD_IMAGE} alt="Hospital corridor with medical staff" />
          </div>
          <div className="mini-consent">
            <span className="provider-avatar">CG</span>
            <span><strong>City General Hospital</strong><small>Emergency physician</small></span>
            <span className="status-pill active">GRANTED</span>
            <hr />
            <div className="mini-tags"><span>Blood group</span><span>Allergies</span><span>Medications</span></div>
            <span className="consent-expiry"><ShieldCheck size={12} /> Read-only · auto-expires · audited</span>
          </div>
        </div>
      </section>

      <section className="impact" id="security">
        <span className="eyebrow">WHY IT MATTERS</span>
        <h2>Critical data, zero chaos.</h2>
        <div className="impact-grid">
          <section className="impact-card"><QrCode size={22} /><h3>Seconds to respond</h3><p>One scan delivers the full critical packet through the responder workflow.</p></section>
          <section className="impact-card"><ShieldCheck size={22} /><h3>Consent first</h3><p>Providers see only approved scopes, and revocation is instant through the consent workflow.</p></section>
          <section className="impact-card"><Activity size={22} /><h3>Everything audited</h3><p>Every access lands in the audit trail workflow — transparent by default.</p></section>
          <section className="impact-card"><Workflow size={22} /><h3>Automated ops</h3><p>Notifications, expiries and verification run without anyone touching a server.</p></section>
        </div>
      </section>

      <footer className="landing-footer" id="emergency">
        <span>© 2026 RESQNOW — not medical advice.</span>
        <div>
          <Link href="/login">Log in</Link>
          <Link href="/signup">Sign up</Link>
          <Link href="/emergency-access">Emergency access</Link>
        </div>
      </footer>
    </main>
  )
}

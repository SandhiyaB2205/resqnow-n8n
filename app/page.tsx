import Link from "next/link"
import {
  Activity, ArrowRight, BellRing, FileCheck2, HeartPulse, QrCode, ShieldCheck, Siren, Workflow,
} from "lucide-react"
import { HeroScene, LandingTilt, Reveal3D } from "../components/resqnow/hero-3d"

const HERO_IMAGE = process.env.NEXT_PUBLIC_HERO_IMAGE_URL || "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=1600&q=80"
const WARD_IMAGE = process.env.NEXT_PUBLIC_WARD_IMAGE_URL || "https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=1200&q=80"

const workflows = [
  { icon: Siren, name: "Emergency responder packet", detail: "One scan assembles your critical profile and alerts your emergency contact — in seconds, day or night." },
  { icon: ShieldCheck, name: "Consent control", detail: "Approvals, expiries and revocations apply automatically — providers lose access the moment you revoke." },
  { icon: FileCheck2, name: "Record verification", detail: "New uploads are checked, organized and sent to a provider for verification — nothing enters your wallet unverified." },
  { icon: BellRing, name: "Access alerts", detail: "Every access to your information sends you an alert and is written to a tamper-proof history." },
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
        <Reveal3D className="hero-copy">
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
        </Reveal3D>
        <HeroScene imageSrc={HERO_IMAGE} imageAlt="Modern hospital building with emergency entrance" />
      </header>

      <section className="landing-section" id="workflows">
        <Reveal3D>
          <span className="eyebrow">AUTOMATED CARE</span>
          <h2>Care that acts the moment you can't.</h2>
          <p className="section-intro">Purpose-built services power your wallet: emergency response, consent control, verification and instant alerts.</p>
        </Reveal3D>
        <div className="workflows-grid">
          {workflows.map(({ icon: Icon, name, detail }, index) => (
            <Reveal3D key={name} delay={index * 0.08}>
              <LandingTilt>
                <section className="card workflow-card">
                  <div className="workflow-top"><span className="workflow-icon"><Icon size={18} /></span><span className="status-pill">ACTIVE</span></div>
                  <h3>{name}</h3>
                  <p>{detail}</p>
                </section>
              </LandingTilt>
            </Reveal3D>
          ))}
        </div>
        <Reveal3D><p className="section-note">Every service runs securely in the background and is monitored around the clock.</p></Reveal3D>
      </section>

      <section className="landing-feature">
        <Reveal3D>
          <div>
            <span className="eyebrow">DESIGNED FOR REAL WARDS</span>
            <h2>Built with emergency rooms in mind.</h2>
            <p>
              First responders scan one QR and get exactly what they need — blood group, allergies,
              medications, conditions and your contact — nothing more, logged every time.
            </p>
            <Link className="btn white" href="/emergency-access">Preview the responder view <ArrowRight size={15} /></Link>
          </div>
        </Reveal3D>
        <Reveal3D delay={0.12}>
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
        </Reveal3D>
      </section>

      <section className="impact" id="security">
        <span className="eyebrow">WHY IT MATTERS</span>
        <h2>Critical data, zero chaos.</h2>
        <div className="impact-grid">
          {[
            { icon: <QrCode size={22} />, title: "Seconds to respond", copy: "One scan delivers the full critical packet to the responders treating you." },
            { icon: <ShieldCheck size={22} />, title: "Consent first", copy: "Providers see only approved scopes — and revocation applies the instant you tap revoke." },
            { icon: <Activity size={22} />, title: "Everything audited", copy: "Every access is written to your history — transparent by default, visible to you alone." },
            { icon: <Workflow size={22} />, title: "Always on", copy: "Alerts, expiries and verification run automatically in the background." },
          ].map(({ icon, title, copy }, index) => (
            <Reveal3D key={title} delay={index * 0.07}>
              <section className="impact-card">{icon}<h3>{title}</h3><p>{copy}</p></section>
            </Reveal3D>
          ))}
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

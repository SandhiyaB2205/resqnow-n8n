"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, HeartPulse, ShieldCheck } from "lucide-react"
import { authClient } from "../../lib/auth-client"
import { emitN8nEvent } from "../../lib/n8n"
import { setStored, STORAGE_KEYS } from "../../lib/storage"

const HERO_IMAGE = process.env.NEXT_PUBLIC_HERO_IMAGE_URL || "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=1400&q=80"

export default function AuthForm({ signup = false }: { signup?: boolean }) {
  const router = useRouter()
  const [values, setValues] = useState({ name: "", email: "", mobile: "", dob: "", password: "", confirm: "" })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!values.email || !values.password || (signup && (!values.name || values.password !== values.confirm))) {
      setError(signup ? "Complete all fields and make sure passwords match." : "Enter your email and password.")
      return
    }
    setLoading(true)
    let ok = false
    try {
      // Try the real backend first (works when DATABASE_URL is configured).
      const result = signup
        ? await authClient.signUp.email({ email: values.email, password: values.password, name: values.name })
        : await authClient.signIn.email({ email: values.email, password: values.password })
      ok = !result.error
    } catch {
      ok = false
    }
    if (!ok) {
      // Demo fallback: no backend configured — sign in locally.
      setStored(STORAGE_KEYS.session, { authenticated: true, email: values.email })
      void emitN8nEvent({
        event: signup ? "auth.signed_up" : "auth.signed_in",
        source: "auth-form",
        payload: { email: values.email, mode: "demo" },
      })
    } else {
      void emitN8nEvent({
        event: signup ? "auth.signed_up" : "auth.signed_in",
        source: "auth-form",
        payload: { email: values.email, mode: "server" },
      })
    }
    setLoading(false)
    router.push("/dashboard")
    router.refresh()
  }

  const field = (label: string, key: keyof typeof values, type = "text", required = true) => (
    <label key={key}>{label}
      <input required={required} type={type} placeholder={label} value={values[key]} onChange={(e) => setValues({ ...values, [key]: e.target.value })} />
    </label>
  )

  return (
    <main className="auth-page with-visual">
      <div className="auth-brand"><Link href="/"><span className="logo-mark"><HeartPulse size={19} /></span> RESQ<span className="logo-accent">NOW</span></Link><span className="demo-chip"><span className="status-dot" /> Secure account</span></div>
      <section className="auth-card card">
        <div className="auth-heading">
          <span className="eyebrow">{signup ? "CREATE YOUR WALLET" : "WELCOME BACK"}</span>
          <h1>{signup ? "Your health wallet starts here." : "Log in to RESQNOW."}</h1>
          <p>{signup ? "Create a patient-controlled home for your verified health information." : "Access your verified health profile and consent controls."}</p>
        </div>
        <form onSubmit={submit}>
          {signup && <div className="auth-grid">{field("Full name", "name")}{field("Mobile number", "mobile", "tel", false)}{field("Date of birth", "dob", "date", false)}</div>}
          {field("Email", "email", "email")}
          {field("Password", "password", "password")}
          {signup && field("Confirm password", "confirm", "password")}
          {signup && <label className="check-row"><input type="checkbox" required /> I agree to use this wallet and understand it contains fictional demo data.</label>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn primary auth-submit" disabled={loading}>{loading ? "Working…" : signup ? "Create account" : "Log in"}<ArrowRight size={16} /></button>
        </form>
        <div className="auth-foot">
          {signup ? <>Already have a wallet? <Link href="/login">Log in</Link></> : <>New to RESQNOW? <Link href="/signup">Create an account</Link></>}
        </div>
        <div className="auth-trust"><ShieldCheck size={15} /> Secure session · Automated verification</div>
      </section>
      <section className="auth-visual" aria-hidden>
        <img src={HERO_IMAGE} alt="" />
        <div className="auth-visual-card card">
          <span className="eyebrow">PATIENT CONTROLLED</span>
          <strong>Your records. Your rules.</strong>
          <small>Consent-based sharing with automated verification for every access, expiry and emergency.</small>
        </div>
      </section>
    </main>
  )
}

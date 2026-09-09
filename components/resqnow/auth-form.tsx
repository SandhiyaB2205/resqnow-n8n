"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, HeartPulse, ShieldCheck } from "lucide-react"
import { authClient } from "../../lib/auth-client"
import { registerProvider } from "../../app/actions/resqnow"

type PrototypeRole = "patient" | "doctor" | "admin"
const PROTOTYPE_PASSWORD = "resqnow-demo"
const PROTOTYPE_ACCOUNTS: Record<PrototypeRole, { name: string; email: string; affiliation?: string; licenseNumber?: string }> = {
  patient: { name: "Demo Patient", email: "patient@resqnow.demo" },
  doctor: { name: "Dr. Demo Physician", email: "doctor@resqnow.demo", affiliation: "RESQNOW General Hospital", licenseNumber: "DEMO-MED-001" },
  admin: { name: "RESQNOW Reviewer", email: "admin@resqnow.demo" },
}

export default function AuthForm({ signup = false }: { signup?: boolean }) {
  const router = useRouter()
  const [values, setValues] = useState({ name: "", email: "", mobile: "", dob: "", password: "", confirm: "", role: "patient", affiliation: "", licenseNumber: "" })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("")
    if (!values.email || !values.password || (signup && (!values.name || values.password !== values.confirm))) { setError(signup ? "Complete all fields and make sure passwords match." : "Enter your email and password."); return }
    setLoading(true)
    const result = signup ? await authClient.signUp.email({ email: values.email, password: values.password, name: values.name, role: values.role } as Parameters<typeof authClient.signUp.email>[0]) : await authClient.signIn.email({ email: values.email, password: values.password })
    if (!result.error && signup && values.role === "doctor") { try { await registerProvider({ fullName: values.name, email: values.email, affiliation: values.affiliation, licenseNumber: values.licenseNumber }) } catch { setLoading(false); setError("Your account was created, but provider verification details could not be submitted."); return } }
    setLoading(false)
    if (result.error) { setError("We couldn't complete that request. Check your details and try again."); return }
    router.push((result.data?.user as { role?: string } | undefined)?.role === "doctor" || values.role === "doctor" ? "/doctor" : "/dashboard"); router.refresh()
  }
  const prototypeLogin = async (prototypeRole: PrototypeRole) => {
    const account = PROTOTYPE_ACCOUNTS[prototypeRole]
    setError(""); setLoading(true)
    let result: any = await authClient.signIn.email({ email: account.email, password: PROTOTYPE_PASSWORD })
    if (result.error) {
      result = await authClient.signUp.email({ email: account.email, password: PROTOTYPE_PASSWORD, name: account.name, role: prototypeRole } as Parameters<typeof authClient.signUp.email>[0])
      if (!result.error && prototypeRole === "doctor") {
        try { await registerProvider({ fullName: account.name, email: account.email, affiliation: account.affiliation!, licenseNumber: account.licenseNumber! }) } catch { /* The account can still be used while the reviewer configures verification. */ }
      }
    }
    setLoading(false)
    if (result.error) { setError("Prototype access could not be created. Try again or use the regular sign-in form."); return }
    router.push(prototypeRole === "admin" ? "/admin/verification" : prototypeRole === "doctor" ? "/doctor" : "/dashboard"); router.refresh()
  }
  const field = (label: string, key: keyof typeof values, type = "text", required = true) => <label key={key}>{label}<input required={required} type={type} value={values[key]} onChange={e => setValues({...values, [key]: e.target.value})}/></label>
  return <main className="auth-page"><div className="auth-brand"><Link href="/"><span className="logo-mark"><HeartPulse size={19}/></span> RESQ<span>NOW</span></Link><span className="demo-chip"><span className="status-dot"/> Secure account</span></div><section className="auth-card card"><div className="auth-heading"><span className="eyebrow">{signup ? "CREATE YOUR WALLET" : "WELCOME BACK"}</span><h1>{signup ? "Your health wallet starts here." : "Log in to RESQNOW."}</h1><p>{signup ? "Create a patient-controlled home for your verified health information." : "Access your verified health profile and consent controls."}</p></div><form onSubmit={submit}>{signup && <div className="auth-grid">{field("Full name", "name")}{field("Mobile number", "mobile", "tel", false)}{field("Date of birth", "dob", "date", false)}<label>Account type<select value={values.role} onChange={e => setValues({...values, role: e.target.value})}><option value="patient">Patient</option><option value="doctor">Doctor</option></select></label>{values.role === "doctor" && <>{field("Hospital or clinic", "affiliation")}{field("Medical license number", "licenseNumber")}</>}</div>}{field("Email", "email", "email")}{field("Password", "password", "password")}{signup && field("Confirm password", "confirm", "password")} {signup && <label className="check-row"><input type="checkbox" required/> I agree to use this prototype wallet and understand the displayed data is for demonstration.</label>}{error && <p className="form-error" role="alert">{error}</p>}<button className="btn primary auth-submit" disabled={loading}>{loading ? "Working..." : signup ? "Create account" : "Log in"}<ArrowRight size={16}/></button></form>{!signup && <section className="prototype-access" aria-label="Prototype quick access"><div><strong>Prototype access</strong><span>Judges can enter without knowing a password.</span></div><div className="prototype-actions"><button type="button" onClick={() => prototypeLogin("patient")} disabled={loading}>Patient view</button><button type="button" onClick={() => prototypeLogin("doctor")} disabled={loading}>Doctor view</button><Link className="prototype-link" href="/admin/verification">Admin review</Link></div><small>Admin review is open for this prototype. Demo accounts are created only when first used.</small></section>}<div className="auth-foot">{signup ? <>Already have a wallet? <Link href="/login">Log in</Link></> : <>New to RESQNOW? <Link href="/signup">Create an account</Link></>}</div><div className="auth-trust"><ShieldCheck size={15}/> Secure session · Demo data only</div></section></main>
}

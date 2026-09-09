"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, HeartPulse, ShieldCheck } from "lucide-react"
import { authClient } from "../../lib/auth-client"
import { registerProvider } from "../../app/actions/resqnow"

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
  const field = (label: string, key: keyof typeof values, type = "text", required = true) => <label key={key}>{label}<input required={required} type={type} value={values[key]} onChange={e => setValues({...values, [key]: e.target.value})}/></label>
  return <main className="auth-page"><div className="auth-brand"><Link href="/"><span className="logo-mark"><HeartPulse size={19}/></span> RESQ<span>NOW</span></Link><span className="demo-chip"><span className="status-dot"/> Secure account</span></div><section className="auth-card card"><div className="auth-heading"><span className="eyebrow">{signup ? "CREATE YOUR WALLET" : "WELCOME BACK"}</span><h1>{signup ? "Your health wallet starts here." : "Log in to RESQNOW."}</h1><p>{signup ? "Create a patient-controlled home for your verified health information." : "Access your verified health profile and consent controls."}</p></div><form onSubmit={submit}>{signup && <div className="auth-grid">{field("Full name", "name")}{field("Mobile number", "mobile", "tel", false)}{field("Date of birth", "dob", "date", false)}<label>Account type<select value={values.role} onChange={e => setValues({...values, role: e.target.value})}><option value="patient">Patient</option><option value="doctor">Doctor</option></select></label>{values.role === "doctor" && <>{field("Hospital or clinic", "affiliation")}{field("Medical license number", "licenseNumber")}</>}</div>}{field("Email", "email", "email")}{field("Password", "password", "password")}{signup && field("Confirm password", "confirm", "password")} {signup && <label className="check-row"><input type="checkbox" required/> I agree to use this wallet and understand it contains fictional demo data.</label>}{error && <p className="form-error" role="alert">{error}</p>}<button className="btn primary auth-submit" disabled={loading}>{loading ? "Working..." : signup ? "Create account" : "Log in"}<ArrowRight size={16}/></button></form><div className="auth-foot">{signup ? <>Already have a wallet? <Link href="/login">Log in</Link></> : <>New to RESQNOW? <Link href="/signup">Create an account</Link></>}</div><div className="auth-trust"><ShieldCheck size={15}/> Secure session · Demo data only</div></section></main>
}

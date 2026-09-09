"use client"

import { useState } from "react"
import { Check, Pencil, ShieldCheck, X } from "lucide-react"

const initialProfile = { name: "", dob: "", blood: "", contact: "", allergies: "", medication: "", conditions: "", procedures: "" }

export default function ProfileEditor() {
  const [profile, setProfile] = useState(() => { if (typeof window === "undefined") return initialProfile; try { return JSON.parse(localStorage.getItem("resq-profile") || "null") || initialProfile } catch { return initialProfile } })
  const [draft, setDraft] = useState(profile)
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  const save = () => { setProfile(draft); localStorage.setItem("resq-profile", JSON.stringify(draft)); setEditing(false); setSaved(true); setTimeout(() => setSaved(false), 2800) }
  const fields = [["Full name", "name"], ["Date of birth", "dob"], ["Blood group", "blood"], ["Emergency contact", "contact"], ["Allergies", "allergies"], ["Current medication", "medication"], ["Existing conditions", "conditions"], ["Previous procedures", "procedures"]] as const
  return <><div className="profile-page-grid"><section className="card identity-card"><div className="identity-avatar">SP</div><h2>{profile.name}</h2><p>Health wallet ID · RSQ-2048-1187</p><div className="verified-line"><ShieldCheck size={16}/> Verified information · Account data</div><button className="btn subtle" onClick={() => { setDraft(profile); setEditing(true) }}><Pencil size={15}/> Edit profile</button></section><section className="card detail-card"><div className="card-heading"><h2>Personal information</h2><span className="badge"><Check size={13}/> Verified</span></div><div className="detail-grid">{fields.slice(0,4).map(([label,key]) => <div key={key}><small>{label}</small><strong>{profile[key]}</strong></div>)}</div></section><section className="card detail-card"><div className="card-heading"><h2>Critical information</h2><span className="badge"><Check size={13}/> Verified</span></div><div className="critical-list">{fields.slice(4).map(([label,key]) => <div key={key}><span><small>{label}</small><strong>{profile[key]}</strong></span></div>)}</div></section></div>{editing && <div className="modal-backdrop"><div className="modal card"><button className="modal-close" aria-label="Close" onClick={() => setEditing(false)}><X size={19}/></button><span className="section-label">EDIT PROFILE</span><h2>Update your health information</h2><p className="modal-copy">Keep your critical information current. This information is stored securely with your account.</p><div className="edit-grid">{fields.map(([label,key]) => <label key={key}>{label}<input value={draft[key]} onChange={e => setDraft({...draft, [key]: e.target.value})}/></label>)}</div><div className="modal-actions"><button className="btn subtle" onClick={() => setEditing(false)}>Cancel</button><button className="btn primary" onClick={save}><Check size={16}/> Save changes</button></div></div></div>}{saved && <div className="toast"><Check size={17}/> Profile updated successfully</div>}</>
}

export { initialProfile }

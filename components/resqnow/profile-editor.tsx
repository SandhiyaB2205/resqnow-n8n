"use client"

import { useEffect, useState } from "react"
import { Check, Pencil, ShieldCheck, X } from "lucide-react"
import { mockProfile } from "../../lib/mock-data"
import { emitN8nEvent } from "../../lib/n8n"
import { loadProfile, setStored, STORAGE_KEYS } from "../../lib/storage"
import type { PatientProfile } from "../../lib/types"

const LIST_KEYS: (keyof PatientProfile)[] = ["allergies", "medications", "conditions", "procedures"]

const FIELDS: [string, keyof PatientProfile][] = [
  ["Full name", "name"], ["Date of birth", "dob"], ["Blood group", "bloodGroup"], ["Emergency contact", "emergencyContact"],
  ["Allergies", "allergies"], ["Current medication", "medications"], ["Existing conditions", "conditions"], ["Previous procedures", "procedures"],
]

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()
}

export default function ProfileEditor() {
  const [profile, setProfile] = useState<PatientProfile>(mockProfile)
  const [draft, setDraft] = useState<PatientProfile>(mockProfile)
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)

  // Hydration-safe load from the shared storage key (stale shapes fall back).
  useEffect(() => {
    const stored = loadProfile(mockProfile)
    setProfile(stored)
    setDraft(stored)
  }, [])

  const save = () => {
    setProfile(draft)
    setStored(STORAGE_KEYS.profile, draft)
    setEditing(false)
    setSaved(true)
    void emitN8nEvent({ event: "record.updated", source: "profile-page", payload: { recordTitle: "Health profile", patient: draft.name } })
    window.setTimeout(() => setSaved(false), 2800)
  }

  const value = (key: keyof PatientProfile, source: PatientProfile): string =>
    Array.isArray(source[key]) ? source[key].join(", ") : String(source[key])

  const setDraftField = (key: keyof PatientProfile, raw: string) => {
    setDraft({ ...draft, [key]: LIST_KEYS.includes(key) ? raw.split(",").map((s) => s.trim()) : raw })
  }

  return (
    <>
      <div className="profile-page-grid">
        <section className="card identity-card">
          <div className="identity-avatar">{initials(profile.name)}</div>
          <h2>{profile.name}</h2>
          <p>Health wallet ID · RSQ-2048-1187</p>
          <div className="verified-line"><ShieldCheck size={16} /> Verified information</div>
          <button className="btn subtle" onClick={() => { setDraft(profile); setEditing(true) }}><Pencil size={15} /> Edit profile</button>
        </section>
        <section className="card detail-card">
          <div className="card-heading"><h2>Personal information</h2><span className="badge"><Check size={13} /> Verified</span></div>
          <div className="detail-grid">
            {FIELDS.slice(0, 4).map(([label, key]) => <div key={key}><small>{label}</small><strong>{value(key, profile)}</strong></div>)}
          </div>
          <div className="card-heading subheading-gap"><h2>Critical information</h2><span className="badge"><Check size={13} /> Verified</span></div>
          <div className="critical-list">
            {FIELDS.slice(4).map(([label, key]) => <div key={key}><span><small>{label}</small><strong>{value(key, profile)}</strong></span></div>)}
          </div>
        </section>
      </div>
      {editing && (
        <div className="modal-backdrop">
          <div className="modal card">
            <button className="modal-close" aria-label="Close" onClick={() => setEditing(false)}><X size={19} /></button>
            <span className="section-label">EDIT PROFILE</span>
            <h2>Update your health information</h2>
            <p className="modal-copy">Keep your critical information current. Separate list items with commas.</p>
            <div className="edit-grid">
              {FIELDS.map(([label, key]) => (
                <label key={key}>{label}<input value={value(key, draft)} onChange={(e) => setDraftField(key, e.target.value)} /></label>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn subtle" onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn primary" onClick={save}><Check size={16} /> Save changes</button>
            </div>
          </div>
        </div>
      )}
      {saved && <div className="toast"><Check size={17} /> Profile updated — automation notified</div>}
    </>
  )
}

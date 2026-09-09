import ProfileEditor from "../../components/resqnow/profile-editor"
import { ShieldCheck } from "lucide-react"

export default function ProfilePage() {
  return <><div className="content standalone-content"><div className="page-header"><div><div className="eyebrow">MY HEALTH</div><h1>My Health Profile</h1><p>A verified snapshot of your critical health information.</p></div><span className="badge"><ShieldCheck size={13}/> Verified profile</span></div><ProfileEditor /></div></>
}

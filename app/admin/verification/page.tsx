import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "../../../lib/auth"
import VerificationDashboard from "../../../components/admin/verification-dashboard"

export default async function VerificationPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  const allowed = (process.env.ADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean)
  if (!session?.user || !allowed.includes(session.user.email.toLowerCase())) redirect("/login")
  return <VerificationDashboard adminName={session.user.name} />
}

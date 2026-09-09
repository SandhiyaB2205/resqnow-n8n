import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "../../../lib/auth"
import VerificationDashboard from "../../../components/admin/verification-dashboard"

export default async function VerificationPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user || (session.user as { role?: string }).role !== "admin") redirect("/login")
  return <VerificationDashboard adminName={session.user.name} />
}

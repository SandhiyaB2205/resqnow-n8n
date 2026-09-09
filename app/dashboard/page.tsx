import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "../../lib/auth"
import ResqnowApp from "../../components/resqnow/resqnow-app"

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/login")
  if ((session.user as { role?: string }).role === "doctor") redirect("/doctor")
  return <ResqnowApp />
}

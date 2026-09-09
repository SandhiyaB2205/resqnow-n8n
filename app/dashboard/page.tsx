import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "../../lib/auth"
import { db } from "../../lib/db"
import { user } from "../../lib/db/schema"
import { eq } from "drizzle-orm"
import ResqnowApp from "../../components/resqnow/resqnow-app"

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/login")
  const rows = await db.select({ role: user.role }).from(user).where(eq(user.id, session.user.id)).limit(1)
  if (rows[0]?.role === "doctor") redirect("/doctor")
  return <ResqnowApp />
}

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "../lib/auth"

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/login")
  redirect((session.user as { role?: string }).role === "doctor" ? "/doctor" : "/dashboard")
}

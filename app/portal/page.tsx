import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth";
import { hasAnyAccess, rolesFromIdToken } from "@/lib/access";
import { readImpersonation } from "@/lib/portal-impersonation";
import { PortalLanding } from "./landing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Signed in → straight to the documents. Signed out → the public landing page
// (middleware lets /portal through without a session for exactly this).
export default async function PortalIndex({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const session = await auth0.getSession();
  if (session) {
    // An admin who signed in from the landing (the logged-out root redirects
    // here) belongs on the admin home — unless they are viewing as a customer.
    const admin = hasAnyAccess(rolesFromIdToken(session.tokenSet?.idToken));
    if (admin && !(await readImpersonation())) redirect("/");
    redirect("/portal/invoices");
  }
  const { returnTo } = await searchParams;
  return <PortalLanding returnTo={returnTo} />;
}

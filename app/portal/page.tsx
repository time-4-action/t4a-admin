import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth";
import { hasAnyAccess, rolesFromIdToken } from "@/lib/access";
import { effectiveRoles, readImpersonation } from "@/lib/portal-impersonation";
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
    // Judged by the effective roles: viewing as an admin user goes to the admin
    // home too, viewing as a role-less user stays in the portal, like their login.
    const imp = await readImpersonation();
    const admin = hasAnyAccess(effectiveRoles(rolesFromIdToken(session.tokenSet?.idToken), imp));
    if (admin && imp?.kind !== "customer") redirect("/");
    redirect("/portal/invoices");
  }
  const { returnTo } = await searchParams;
  return <PortalLanding returnTo={returnTo} />;
}

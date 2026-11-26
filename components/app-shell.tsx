"use client";
import { usePathname } from "next/navigation";
import Nav from "@/components/nav";
import PortalNav from "@/components/portal-nav";
import { ViewingAsBanner } from "@/components/viewing-as-banner";
import { MaintenanceBanner } from "@/components/maintenance-banner";
import type { ViewingAs } from "@/components/viewing-as";

// Chooses the chrome by route: the stripped-down B2B portal shell under /portal,
// the full admin sidebar everywhere else. Middleware (lib/proxy.ts) lets any
// signed-in user into /portal (an admin can be a customer too) and only admins
// into admin routes, so a path-based split is correct and lets both shells live under one root layout.

type ShellUser = { name?: string | null; email?: string | null; picture?: string | null };

export type { ViewingAs } from "@/components/viewing-as";

export default function AppShell({
  user,
  roles,
  viewingAs,
  ownPortal = false,
  adminHome = false,
  children,
}: {
  user?: ShellUser;
  roles?: string[];
  // Set when an admin is viewing the portal as a customer, or the whole app as
  // another user (lib/portal-impersonation.ts).
  viewingAs?: ViewingAs | null;
  // The signed-in admin is also a customer: link the admin nav to their portal.
  ownPortal?: boolean;
  // The signed-in user is an admin: link the portal nav back to the admin home.
  adminHome?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isPortal = pathname === "/portal" || pathname.startsWith("/portal/");

  // Logged-out visitor on the portal: the public landing page (app/portal/landing.tsx)
  // renders on its own, without the customer sidebar.
  if (isPortal && !user) {
    return (
      <main className="flex-1 min-w-0 overflow-y-auto bg-background">
        <MaintenanceBanner />
        {children}
      </main>
    );
  }

  // The "viewing as" strip: on every portal page for either kind, and on the
  // admin pages too while viewing as a user — an admin user is shown the admin
  // app with THEIR roles, and it must never be mistaken for your own session.
  const banner = viewingAs && (isPortal || viewingAs.kind === "user");

  // Strips (maintenance, viewing as) stack above the page, which fills what is left.
  return (
    <>
      {isPortal ? <PortalNav user={user} viewingAs={viewingAs} adminHome={adminHome} /> : <Nav user={user} roles={roles} viewingAs={viewingAs} ownPortal={ownPortal} />}
      <main className="flex-1 min-w-0 overflow-hidden bg-background pt-12 md:pt-0 flex flex-col">
        <MaintenanceBanner />
        {banner && <ViewingAsBanner viewingAs={viewingAs} />}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col [&>*]:flex-1 [&>*]:min-h-0">{children}</div>
      </main>
    </>
  );
}

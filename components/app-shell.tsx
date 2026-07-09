"use client";
import { usePathname } from "next/navigation";
import Nav from "@/components/nav";
import PortalNav from "@/components/portal-nav";

// Chooses the chrome by route: the stripped-down B2B portal shell under /portal,
// the full admin sidebar everywhere else. Middleware (lib/proxy.ts) already
// guarantees only customers reach /portal and only admins reach admin routes, so
// a path-based split is correct and lets both shells live under one root layout.

type ShellUser = { name?: string | null; email?: string | null; picture?: string | null };

export default function AppShell({
  user,
  roles,
  children,
}: {
  user?: ShellUser;
  roles?: string[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isPortal = pathname === "/portal" || pathname.startsWith("/portal/");

  return (
    <>
      {isPortal ? <PortalNav user={user} /> : <Nav user={user} roles={roles} />}
      <main className="flex-1 min-w-0 overflow-hidden bg-background pt-12 md:pt-0">
        {children}
      </main>
    </>
  );
}

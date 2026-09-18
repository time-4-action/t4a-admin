import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { auth0 } from "@/lib/auth";
import { readImpersonation } from "@/lib/portal-impersonation";
import { StopViewingButton } from "@/components/viewing-as-banner";

export const dynamic = "force-dynamic";

export default async function ForbiddenPage() {
  // A super-admin "viewing as" a user lands here wherever THAT user would — the
  // shell (and its banner) is covered, so offer the way out right here.
  const session = await auth0.getSession();
  const imp = session ? await readImpersonation() : null;
  const viewingUser = imp?.kind === "user" ? imp : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="flex flex-col items-center text-center max-w-xs w-full mx-4 gap-5 reveal">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
          <ShieldAlert className="w-7 h-7 text-destructive" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-medium text-foreground tracking-tight">Access denied</h1>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
            You don&apos;t have permission to view this page.
          </p>
          <p className="text-xs text-muted-foreground mt-3">
            This area requires the{" "}
            <span className="font-mono text-[11px] font-semibold text-foreground bg-muted px-1.5 py-0.5 rounded-md">admin</span>{" "}
            role.
          </p>
          {viewingUser && (
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-3 leading-relaxed">
              You are viewing the admin as <span className="font-semibold">{viewingUser.name || viewingUser.email}</span> — this
              is exactly what they get here.
            </p>
          )}
        </div>
        {viewingUser ? (
          <StopViewingButton subject="user" className="h-9 px-5 rounded-xl text-xs font-semibold" />
        ) : (
        <Link
          href="/auth/logout"
          className="inline-flex items-center justify-center px-5 py-2 rounded-xl bg-foreground text-background text-xs font-semibold hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Log out
        </Link>
        )}
      </div>
    </div>
  );
}

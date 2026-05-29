import { LogIn } from "lucide-react";
import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="flex flex-col items-center text-center max-w-xs w-full mx-4 gap-5 reveal">
        <div className="w-16 h-16 rounded-2xl bg-accent-brand/10 border border-accent-brand/20 flex items-center justify-center">
          <LogIn className="w-7 h-7 text-accent-brand" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-medium text-foreground tracking-tight">Sign in required</h1>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
            You need to be signed in to access this page.
          </p>
        </div>
        <Link
          href="/auth/login"
          className="inline-flex items-center justify-center px-5 py-2 rounded-xl bg-foreground text-background text-xs font-semibold hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}

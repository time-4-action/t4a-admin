import { LogIn } from "lucide-react";
import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[oklch(0.99_0_0)]">
      <div className="flex flex-col items-center text-center max-w-xs w-full mx-4 gap-5">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center">
          <LogIn className="w-7 h-7 text-blue-500" />
        </div>
        <div>
          <h1 className="text-base font-bold text-slate-900 tracking-tight">Sign In Required</h1>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed">
            You need to be signed in to access this page.
          </p>
        </div>
        <Link
          href="/auth/login"
          className="inline-flex items-center justify-center px-5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-700 transition-colors"
        >
          Sign In
        </Link>
      </div>
    </div>
  );
}

import { ShieldAlert } from "lucide-react";
import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[oklch(0.99_0_0)]">
      <div className="flex flex-col items-center text-center max-w-xs w-full mx-4 gap-5">
        <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center">
          <ShieldAlert className="w-7 h-7 text-red-500" />
        </div>
        <div>
          <h1 className="text-base font-bold text-slate-900 tracking-tight">Access Denied</h1>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed">
            You don&apos;t have permission to view this page.
          </p>
          <p className="text-xs text-slate-400 mt-2">
            This area requires the{" "}
            <span className="font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-md">admin</span>{" "}
            role.
          </p>
        </div>
        <Link
          href="/auth/logout"
          className="inline-flex items-center justify-center px-5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-700 transition-colors"
        >
          Log out
        </Link>
      </div>
    </div>
  );
}

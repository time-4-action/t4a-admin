import { auth0 } from "@/lib/auth";
import { MailQuestion } from "lucide-react";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Shown when a logged-in user's email does not match a Metakocka partner. They
// are authenticated but have no documents to show.
export default async function NoAccountPage() {
  const session = await auth0.getSession();
  const email = session?.user?.email;

  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="max-w-md text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-500/12">
          <MailQuestion className="h-7 w-7 text-teal-500" />
        </span>
        <h1 className="font-display text-xl font-semibold text-foreground tracking-tight mt-4">
          We couldn&apos;t find your account
        </h1>
        <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed">
          {email ? (
            <>
              We don&apos;t have any documents linked to <span className="font-medium text-foreground">{email}</span>.
            </>
          ) : (
            <>We don&apos;t have any documents linked to your account.</>
          )}{" "}
          If you believe this is a mistake, please contact us and we&apos;ll get you set up.
        </p>
        <div className="mt-5 flex items-center justify-center gap-3">
          <a
            href="mailto:info@time-4-action.com"
            className="inline-flex items-center rounded-xl bg-teal-500/12 text-teal-600 dark:text-teal-400 px-4 py-2 text-[13px] font-semibold hover:bg-teal-500/20 transition-colors"
          >
            Contact us
          </a>
          <a
            href="/auth/logout"
            className="inline-flex items-center rounded-xl px-4 py-2 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            Log out
          </a>
        </div>
      </div>
    </div>
  );
}

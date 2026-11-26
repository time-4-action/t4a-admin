import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "flag-icons/css/flag-icons.min.css";
import "./globals.css";
import AppShell from "@/components/app-shell";
import type { ViewingAs } from "@/components/viewing-as";
import { CurrencyProvider } from "@/lib/currency-context";
import { ThemeProvider } from "@/lib/theme-context";
import { auth0 } from "@/lib/auth";
import { effectiveRoles, readImpersonation } from "@/lib/portal-impersonation";
import { hasAnyAccess, rolesFromIdToken } from "@/lib/access";
import { PLATFORM_NAME } from "@/lib/brand";
import { adminLoginsForPartner, hasOwnPortal, linkSubjectEmail, type AdminLogin } from "@/lib/portal";
import { canImpersonateUser } from "@/lib/portal-impersonation-codec";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: PLATFORM_NAME,
};

// Inline before-paint script: applies the .dark class on <html> based on the
// user's persisted choice (localStorage["theme"]), falling back to the OS
// preference. This must run before React hydrates to prevent a flash of the
// wrong theme on first load.
const noFlashThemeScript = `(function(){try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth0.getSession();
  const user = session?.user;
  // An admin viewing the portal as a customer, or the app as another user (signed
  // cookie + eligible role). Viewing as a user swaps in THAT user's roles, so the
  // nav shows exactly the sections they hold.
  const imp = session ? await readImpersonation() : null;
  const roles = effectiveRoles(rolesFromIdToken(session?.tokenSet?.idToken), imp);
  const viewingAs: ViewingAs | null = !imp
    ? null
    : imp.kind === "user"
      ? { kind: "user", userId: imp.userId, email: imp.email, name: imp.name, roles: imp.roles, admin: hasAnyAccess(imp.roles) }
      : { kind: "customer", partnerMkId: imp.partnerMkId, partnerName: imp.partnerName };

  // An admin who is also a customer gets links between the admin app and their own
  // portal. Viewing as a user shows that user's links, like their own login would.
  // Viewing as a customer: if an admin login sits behind it, a super-admin may jump
  // to viewing as that login (what the person sees from the portal's Admin link).
  const admin = hasAnyAccess(roles);
  const subjectEmail = linkSubjectEmail(user?.email, imp);
  const ownPortal = admin && subjectEmail ? await hasOwnPortal(subjectEmail) : false;
  const adminHome = admin && imp?.kind !== "customer";
  let adminAs: AdminLogin | null = null;
  if (imp?.kind === "customer" && canImpersonateUser(rolesFromIdToken(session?.tokenSet?.idToken))) {
    adminAs = (await adminLoginsForPartner(imp.partnerMkId).catch(() => []))[0] ?? null;
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashThemeScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex h-screen overflow-hidden bg-background text-foreground`}
      >
        <ThemeProvider>
          <CurrencyProvider>
            <AppShell user={user} roles={roles} viewingAs={viewingAs} ownPortal={ownPortal} adminHome={adminHome} adminAs={adminAs}>
              {children}
            </AppShell>
          </CurrencyProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

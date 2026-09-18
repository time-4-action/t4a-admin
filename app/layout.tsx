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

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME ?? "Admin",
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
            <AppShell user={user} roles={roles} viewingAs={viewingAs}>
              {children}
            </AppShell>
          </CurrencyProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

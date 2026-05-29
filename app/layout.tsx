import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Nav from "@/components/nav";
import { CurrencyProvider } from "@/lib/currency-context";
import { ThemeProvider } from "@/lib/theme-context";
import { auth0 } from "@/lib/auth";

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
            <Nav user={user} />
            <main className="flex-1 overflow-y-auto bg-background pt-12 md:pt-0">
              {children}
            </main>
          </CurrencyProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

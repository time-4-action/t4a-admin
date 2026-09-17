import type { Metadata } from "next";

// The customer portal is its own product in the browser tab — never the admin's name.
export const metadata: Metadata = {
  title: { default: "Time 4 Action B2B", template: "%s · Time 4 Action B2B" },
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return children;
}

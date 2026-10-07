import type { Metadata } from "next";
import { PLATFORM_NAME } from "@/lib/brand";

// The customer portal carries the same platform name as the admin (lib/brand.ts).
export const metadata: Metadata = {
  title: { default: PLATFORM_NAME, template: `%s · ${PLATFORM_NAME}` },
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return children;
}

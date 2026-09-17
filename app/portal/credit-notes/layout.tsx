import type { Metadata } from "next";

export const metadata: Metadata = { title: "Credit notes" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

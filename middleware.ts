// middleware.ts
export { proxy as middleware } from "@/lib/proxy";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|healthz).*)"],
};

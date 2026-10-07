// Liveness probe for the deploy job and the public verify step. Outside the
// auth proxy (see the matcher in middleware.ts) and free of Mongo, so a
// database outage never makes a deploy roll back. It reports no version: the
// deploy checks APP_VERSION inside the container instead.
export const dynamic = "force-dynamic";

export function GET() {
  return new Response("ok", {
    headers: { "content-type": "text/plain", "cache-control": "no-store" },
  });
}

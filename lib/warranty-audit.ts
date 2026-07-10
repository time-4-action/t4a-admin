import "server-only";
import { auth0 } from "@/lib/auth";

// The `_audit` envelope the warranty service expects alongside a claim/settings
// write. The service computes the field-level changes itself; the admin only
// supplies who (from the session) and the optional message.
export type AuditEnvelope = {
  actorId: string;
  actorName: string;
  actorEmail: string;
  message: string;
};

/**
 * Build the audit envelope, stamping the actor from the session server-side
 * (never trusted from the browser). `audit` is the optional client payload —
 * only its `message` is read.
 */
export async function buildAuditEnvelope(audit: unknown): Promise<AuditEnvelope> {
  const session = await auth0.getSession();
  const message =
    audit &&
    typeof audit === "object" &&
    typeof (audit as { message?: unknown }).message === "string"
      ? (audit as { message: string }).message.trim()
      : "";
  return {
    actorId: session?.user?.sub ?? "",
    actorName: session?.user?.name ?? session?.user?.email ?? "Admin",
    actorEmail: session?.user?.email ?? "",
    message,
  };
}

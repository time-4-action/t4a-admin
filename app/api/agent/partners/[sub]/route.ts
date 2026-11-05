import { agentError, agentJson, agentRoute, scrubSecrets } from "@/lib/agent-api";
import { callPartnerPortal } from "@/lib/partner-api";
import { getRoleUser } from "@/lib/role-users";
import { PARTNER_ROLE_NAME } from "@/lib/partner-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sub: string }> };

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

// GET /api/agent/partners/:sub — one partner: the portal's detail (connections,
// feeds, exports, downloads, most-interacted-with) + its activity timeline, joined
// with the Auth0 identity like the Partner detail page. :sub is the Auth0 sub,
// URL-encoded ("auth0%7C123").
export const GET = agentRoute<Ctx>(async (_req, { params }) => {
  const { sub: rawSub } = await params;
  const sub = decodeURIComponent(rawSub); // Auth0 subs never contain a literal "%"
  const path = `/api/admin/partners/${encodeURIComponent(sub)}`;
  let detail, activity, identity;
  try {
    [detail, activity, identity] = await Promise.all([
      callPartnerPortal(path),
      callPartnerPortal(`${path}/activity?limit=100`),
      getRoleUser(PARTNER_ROLE_NAME, sub),
    ]);
  } catch (err) {
    return agentError(`partners unavailable: ${errText(err)}`, 502);
  }
  if (!detail.ok) {
    if (detail.status === 404) return agentError("partner not found", 404);
    return agentError(`partner portal failed: ${detail.error}`, 502);
  }
  const data = detail.data as { partner?: Record<string, unknown> } | null;
  const partner = (data?.partner ?? data ?? {}) as Record<string, unknown>;
  const portalEmail = typeof partner.email === "string" ? partner.email : null;
  return agentJson({
    sub,
    name: identity?.name || portalEmail || sub,
    email: identity?.email || portalEmail || "",
    picture: identity?.picture ?? null,
    hasPartnerRole: !!identity,
    partner: scrubSecrets(partner),
    activity: activity.ok ? scrubSecrets(activity.data) : null,
    activityError: activity.ok ? null : activity.error,
  });
});

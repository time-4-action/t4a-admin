import { notFound } from "next/navigation";
import { DetailCrumbBar } from "@/components/detail-crumb-bar";
import { callPartnerPortal } from "@/lib/partner-api";
import { auth0 } from "@/lib/auth";
import { getRoleUser } from "@/lib/role-users";
import { PARTNER_ROLE_NAME } from "@/lib/partner-role";
import type { PartnerDetail } from "@/types/partner";
import { PartnerDetailClient } from "./partner-detail-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ sub: string }> };

export default async function PartnerDetailPage({ params }: PageProps) {
  const { sub: rawSub } = await params;
  // Next can hand back the dynamic segment still percent-encoded (the link
  // encodes the "|" in "auth0|123" to "%7C"). Decode once so the Auth0 lookup
  // and the portal query both use the real sub — and the upstream call below
  // re-encodes it exactly once. Auth0 subs never contain a literal "%", so this
  // is safe whether or not Next already decoded it.
  const sub = decodeURIComponent(rawSub);
  const [result, session, identity] = await Promise.all([
    callPartnerPortal(`/api/admin/partners/${encodeURIComponent(sub)}`),
    auth0.getSession(),
    getRoleUser(PARTNER_ROLE_NAME, sub),
  ]);

  if (!result.ok) {
    if (result.status === 404) notFound();
    return (
      <div className="p-8 text-[13px] text-destructive">
        Couldn&apos;t load this partner: {result.error}
      </div>
    );
  }

  const detail = (result.data as { partner: PartnerDetail }).partner;
  // identity.name is already resolved (real name → email → user_id) by
  // getUsersWithRole, so the hero never shows a raw "auth0|…" when the user has
  // an email on file.
  const displayName = identity?.name || detail.email || identity?.email || sub;
  const email = identity?.email || detail.email || "";
  const adminLabel = session?.user?.name ?? session?.user?.email ?? "Admin";
  const adminPictureUrl = session?.user?.picture ?? undefined;

  return (
    <div className="flex flex-col h-full bg-background">
      <DetailCrumbBar
        backHref="/partners"
        backLabel="Partners"
        current={<span className="text-[12px] font-medium text-foreground truncate">{displayName}</span>}
      />

      <PartnerDetailClient
        sub={sub}
        detail={detail}
        displayName={displayName}
        email={email}
        picture={identity?.picture}
        adminLabel={adminLabel}
        adminPictureUrl={adminPictureUrl}
      />
    </div>
  );
}

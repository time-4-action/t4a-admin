import { connectDB } from "@/lib/mongodb";
import { UserUsage } from "@/models/user-usage";
import { UserLimit } from "@/models/user-limit";
import { Conversation } from "@/models/conversation";
import { getMgmtClient } from "@/lib/mgmt";
import { isDevRole, isAiRole } from "@/lib/ai-role";
import { UserDetailStats, UserUsageTable, UserDetailSidebar, UserConversations } from "./user-detail-client";
import { DetailCrumbBar } from "@/components/detail-crumb-bar";
import { Bot, ShieldAlert, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

function RoleBadge({ name }: { name: string }) {
  const ai = isAiRole(name);
  const admin = name.toLowerCase().includes("admin");
  if (ai) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/50">
      <Bot className="w-3 h-3" />{name}
    </span>
  );
  if (admin) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-orange-50 text-orange-700 border border-orange-100 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800/50">
      <ShieldAlert className="w-3 h-3" />{name}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-muted text-muted-foreground border border-border">
      <ShieldCheck className="w-3 h-3" />{name}
    </span>
  );
}

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  await connectDB();
  const mgmt = getMgmtClient();

  const [auth0User, usageDocs, limitDoc, convCount, userRolesRes, allRolesRes] = await Promise.all([
    mgmt.users.get(id),
    UserUsage.find({ userId: id }),
    UserLimit.findOne({ userId: id }),
    Conversation.countDocuments({ userId: id }),
    mgmt.users.roles.list(id),
    mgmt.roles.list(),
  ]);

  const currentRoles = ((userRolesRes as any).data as any[])
    .filter((r: any) => !isDevRole(r.name))
    .map((r: any) => ({ id: r.id as string, name: r.name as string }));

  const allRoles = ((allRolesRes as any).data as any[])
    .filter((r: any) => !isDevRole(r.name))
    .map((r: any) => ({ id: r.id as string, name: r.name as string, description: (r.description ?? "") as string }));

  const totalCost = usageDocs.reduce((s, u) => s + u.totalCostUsd, 0);
  const words = (auth0User.name ?? "?").split(" ").filter(Boolean);
  const initials = words.slice(0, 2).map((w: string) => w[0].toUpperCase()).join("");

  const plainUsage = usageDocs.map((u) => ({
    modelId: u.modelId,
    inputTokens: u.inputTokens,
    outputTokens: u.outputTokens,
    cacheReadTokens: u.cacheReadTokens ?? 0,
    cacheCreationTokens: u.cacheCreationTokens ?? 0,
    totalCostUsd: u.totalCostUsd,
  }));

  const plainLimit = limitDoc
    ? { limitUsd: limitDoc.limitUsd, period: limitDoc.period, currentSpendUsd: limitDoc.currentSpendUsd }
    : null;

  return (
    <div className="flex flex-col h-full bg-background">

      {/* Sticky top bar */}
      <DetailCrumbBar
        backHref="/users"
        backLabel="Users"
        className="bg-background/90"
        current={<span className="text-[12px] font-medium text-foreground truncate">{auth0User.name}</span>}
      />

      {/* Body */}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">

        {/* ── Main column ─────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto min-w-0">

          {/* Hero */}
          <div className="relative px-4 md:px-8 pt-6 md:pt-8 pb-6 md:pb-7 border-b border-border/50 overflow-hidden">
            {/* Subtle gradient backdrop */}
            <div className="absolute inset-0 bg-gradient-to-br from-muted/40 via-transparent to-transparent pointer-events-none" />
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-muted/20 to-transparent rounded-full translate-x-1/2 -translate-y-1/2 pointer-events-none" />

            <div className="relative flex items-start gap-5">
              {/* Avatar */}
              {auth0User.picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={auth0User.picture}
                  alt={auth0User.name ?? ""}
                  className="w-[60px] h-[60px] rounded-2xl border border-border/60 object-cover shrink-0 shadow-sm"
                />
              ) : (
                <div className="w-[60px] h-[60px] rounded-2xl bg-foreground flex items-center justify-center shrink-0 shadow-sm ring-1 ring-border/40">
                  <span className="text-base font-bold text-background tracking-tight">{initials}</span>
                </div>
              )}

              {/* Identity */}
              <div className="flex-1 min-w-0 pt-0.5">
                <h1 className="font-display text-2xl md:text-3xl font-medium text-foreground tracking-tight leading-none truncate">
                  {auth0User.name}
                </h1>
                <p className="text-[13px] text-muted-foreground mt-0.5 truncate">{auth0User.email}</p>
                {currentRoles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {currentRoles.map((r) => <RoleBadge key={r.id} name={r.name} />)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="px-4 md:px-8 py-6 border-b border-border/50">
            <UserDetailStats totalCost={totalCost} convCount={convCount} limitDoc={plainLimit} />
          </div>

          {/* Usage */}
          <div className="px-4 md:px-8 py-6 md:py-7 border-b border-border/50">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-[13px] font-semibold text-foreground">Usage by model</h2>
              {plainUsage.length > 0 && (
                <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full tabular-nums">
                  {plainUsage.length}
                </span>
              )}
            </div>
            <UserUsageTable usageDocs={plainUsage} totalCost={totalCost} />
          </div>

          {/* Conversations */}
          <div className="px-4 md:px-8 py-6 md:py-7">
            <h2 className="text-[13px] font-semibold text-foreground mb-4">Conversations</h2>
            <UserConversations userId={id} />
          </div>
        </div>

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <aside className="w-full md:w-[310px] shrink-0 border-t md:border-t-0 md:border-l border-border/60 bg-muted/10 overflow-y-auto">
          <UserDetailSidebar
            user={{ id, name: auth0User.name ?? "", email: auth0User.email ?? "", picture: auth0User.picture, limit: plainLimit }}
            allRoles={allRoles}
            currentRoles={currentRoles}
          />
        </aside>
      </div>
    </div>
  );
}

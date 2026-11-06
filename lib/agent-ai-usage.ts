import "server-only";

// lib/agent-ai-usage.ts
//
// AI usage for the agent API (/api/agent/ai-usage): the same figures as the AI
// dashboard (/api/admin/stats) and the usage table (/api/admin/usage), from the
// same collections, with dev-role users left out exactly like those routes do
// (getDevUserIds). `conversationsToday` mirrors the dashboard's "conversations
// today" (Conversation docs created since local midnight).

import { connectDB } from "@/lib/mongodb";
import { UserUsage } from "@/models/user-usage";
import { UserLimit } from "@/models/user-limit";
import { Conversation } from "@/models/conversation";
import { listAllUsers } from "@/lib/auth0-mgmt";
import { getDevUserIds } from "@/lib/dev-users";

type UsageDoc = {
  userId: string;
  modelId: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  conversationCount?: number;
  totalCostUsd?: number;
};

type Bucket = {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  conversations: number;
};

const empty = (): Bucket => ({ costUsd: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, conversations: 0 });

function add(b: Bucket, d: UsageDoc) {
  b.costUsd += d.totalCostUsd ?? 0;
  b.inputTokens += d.inputTokens ?? 0;
  b.outputTokens += d.outputTokens ?? 0;
  b.cacheReadTokens += d.cacheReadTokens ?? 0;
  b.cacheCreationTokens += d.cacheCreationTokens ?? 0;
  b.conversations += d.conversationCount ?? 0;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const tidy = (b: Bucket): Bucket => ({ ...b, costUsd: round6(b.costUsd) });

export async function loadAgentAiUsage(query: { userId?: string | null }) {
  const userId = query.userId?.trim() || null;
  await connectDB();
  const [devIds, users] = await Promise.all([getDevUserIds(), listAllUsers()]);
  const userById = new Map<string, { email: string | null; name: string | null }>(
    users.map((u: { user_id: string; email?: string; name?: string }) => [u.user_id, { email: u.email ?? null, name: u.name ?? null }]),
  );

  const usageFilter = userId ? { userId } : {};
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
  const [docs, limits, conversationsToday] = await Promise.all([
    UserUsage.find(usageFilter).lean<UsageDoc[]>().exec(),
    UserLimit.find(userId ? { userId } : {}).lean().exec(),
    Conversation.countDocuments({ createdAt: { $gte: todayStart }, ...(userId ? { userId } : {}) }).exec(),
  ]);
  const limitByUser = new Map(limits.map((l) => [l.userId, l]));

  const totals = empty();
  const byModel = new Map<string, Bucket>();
  const byUser = new Map<string, Bucket & { models: string[] }>();
  for (const d of docs) {
    if (devIds.has(d.userId)) continue;
    add(totals, d);
    const m = byModel.get(d.modelId) ?? empty();
    add(m, d);
    byModel.set(d.modelId, m);
    const u = byUser.get(d.userId) ?? { ...empty(), models: [] };
    add(u, d);
    if (!u.models.includes(d.modelId)) u.models.push(d.modelId);
    byUser.set(d.userId, u);
  }

  return {
    currency: "USD",
    totals: { ...tidy(totals), activeUsers: byUser.size },
    byModel: Array.from(byModel, ([modelId, b]) => ({ modelId, ...tidy(b) })).sort((a, b) => b.costUsd - a.costUsd),
    byUser: Array.from(byUser, ([uid, b]) => {
      const who = userById.get(uid);
      const l = limitByUser.get(uid);
      return {
        userId: uid,
        email: who?.email ?? null,
        name: who?.name ?? null,
        ...tidy(b),
        limit: l
          ? { limitUsd: l.limitUsd, period: l.period, currentSpendUsd: l.currentSpendUsd ?? 0, periodStart: l.periodStart ? new Date(l.periodStart).toISOString() : null }
          : null,
      };
    }).sort((a, b) => b.costUsd - a.costUsd),
    conversationsToday,
  };
}

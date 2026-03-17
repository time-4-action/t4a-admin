import { connectDB } from "@/lib/mongodb";
import { UserUsage } from "@/models/user-usage";
import { getMgmtClient } from "@/lib/mgmt";
import { getDevUserIds } from "@/lib/dev-users";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await connectDB();
    const mgmt = getMgmtClient();

    const [docs, { data: auth0Users }, devUserIds] = await Promise.all([
      UserUsage.find({}).lean(),
      mgmt.users.list({ per_page: 100 }),
      getDevUserIds(),
    ]);

    const emailMap = Object.fromEntries(auth0Users.map((u) => [u.user_id, u.email]));

    type UsageRow = {
      userId: string; email: string; modelId: string;
      inputTokens: number; outputTokens: number; cacheReadTokens: number;
      cacheCreationTokens: number; conversationCount: number; totalCostUsd: number;
    };

    // Build rows, labelling dev users as "Development"
    const devAgg = new Map<string, UsageRow>();
    const rows: UsageRow[] = [];

    for (const d of docs) {
      if (devUserIds.has(d.userId)) {
        const key = d.modelId;
        const existing = devAgg.get(key);
        if (existing) {
          existing.inputTokens         += d.inputTokens;
          existing.outputTokens        += d.outputTokens;
          existing.cacheReadTokens     += d.cacheReadTokens;
          existing.cacheCreationTokens += d.cacheCreationTokens;
          existing.conversationCount   += d.conversationCount;
          existing.totalCostUsd        += d.totalCostUsd;
        } else {
          devAgg.set(key, {
            userId:               "dev",
            email:                "Development",
            modelId:              d.modelId,
            inputTokens:          d.inputTokens,
            outputTokens:         d.outputTokens,
            cacheReadTokens:      d.cacheReadTokens,
            cacheCreationTokens:  d.cacheCreationTokens,
            conversationCount:    d.conversationCount,
            totalCostUsd:         d.totalCostUsd,
          });
        }
      } else {
        rows.push({
          userId:               d.userId,
          email:                emailMap[d.userId] ?? d.userId,
          modelId:              d.modelId,
          inputTokens:          d.inputTokens,
          outputTokens:         d.outputTokens,
          cacheReadTokens:      d.cacheReadTokens,
          cacheCreationTokens:  d.cacheCreationTokens,
          conversationCount:    d.conversationCount,
          totalCostUsd:         d.totalCostUsd,
        });
      }
    }

    // Append aggregated dev rows
    rows.push(...devAgg.values());

    // sort by cost desc
    rows.sort((a, b) => b.totalCostUsd - a.totalCostUsd);

    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /api/admin/usage error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

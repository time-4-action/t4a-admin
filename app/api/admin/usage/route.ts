import { connectDB } from "@/lib/mongodb";
import { UserUsage } from "@/models/user-usage";
import { getMgmtClient } from "@/lib/mgmt";
import { getDevUserIds } from "@/lib/dev-users";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await connectDB();
    const mgmt = getMgmtClient();

    const [docs, auth0Users, devUserIds] = await Promise.all([
      UserUsage.find({}).lean(),
      mgmt.users.list({ per_page: 100 }),
      getDevUserIds(),
    ]);

    const emailMap = Object.fromEntries(((auth0Users as any).data as any[]).map((u: any) => [u.user_id, u.email]));

    type UsageRow = {
      userId: string; email: string; modelId: string;
      inputTokens: number; outputTokens: number; cacheReadTokens: number;
      cacheCreationTokens: number; conversationCount: number; totalCostUsd: number;
    };

    // Build rows, skipping dev users entirely
    const rows: UsageRow[] = [];

    for (const d of docs) {
      if (devUserIds.has(d.userId)) continue;
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

    // sort by cost desc
    rows.sort((a, b) => b.totalCostUsd - a.totalCostUsd);

    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /api/admin/usage error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

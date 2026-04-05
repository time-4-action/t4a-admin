import { connectDB } from "@/lib/mongodb";
import { UserUsage } from "@/models/user-usage";
import { Conversation } from "@/models/conversation";
import { getMgmtClient } from "@/lib/mgmt";
import { getDevUserIds } from "@/lib/dev-users";
import { NextResponse } from "next/server";

export async function GET() {
  await connectDB();

  const [usageAgg, byModel, convToday] = await Promise.all([
    UserUsage.aggregate([
      {
        $group: {
          _id: null,
          totalCostUsd: { $sum: "$totalCostUsd" },
          activeUsers:  { $addToSet: "$userId" },
          inputTokens:  { $sum: "$inputTokens" },
          outputTokens: { $sum: "$outputTokens" },
        },
      },
    ]),
    UserUsage.aggregate([
      { $group: { _id: "$modelId", costUsd: { $sum: "$totalCostUsd" } } },
      { $project: { modelId: "$_id", costUsd: 1, _id: 0 } },
      { $sort: { costUsd: -1 } },
    ]),
    Conversation.countDocuments({
      createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    }),
  ]);

  // byUser: join with Auth0 for display names, group dev-role users as "Development"
  const byUserAgg = await UserUsage.aggregate([
    { $group: { _id: "$userId", costUsd: { $sum: "$totalCostUsd" } } },
    { $sort: { costUsd: -1 } },
  ]);

  let byUser: { userId: string; name: string; costUsd: number }[] = [];
  try {
    const mgmt = getMgmtClient();
    const [auth0UsersPage, devUserIds] = await Promise.all([
      mgmt.users.list({ per_page: 100 }),
      getDevUserIds(),
    ]);
    const auth0Users = (auth0UsersPage as any).data as any[];

    const emailMap = Object.fromEntries(auth0Users.map((u: any) => [u.user_id, u.email]));

    let devCost = 0;
    const regularUsers: { userId: string; name: string; costUsd: number }[] = [];

    for (const u of byUserAgg) {
      if (devUserIds.has(u._id)) {
        devCost += u.costUsd;
      } else {
        regularUsers.push({
          userId: u._id,
          name: emailMap[u._id] ?? u._id,
          costUsd: u.costUsd,
        });
      }
    }

    byUser = regularUsers.slice(0, 10);
    if (devCost > 0) {
      byUser.push({ userId: "dev", name: "Development", costUsd: devCost });
      byUser.sort((a, b) => b.costUsd - a.costUsd);
    }
  } catch {
    byUser = byUserAgg.slice(0, 10).map((u: any) => ({ userId: u._id, name: u._id, costUsd: u.costUsd }));
  }

  const agg = usageAgg[0] ?? {};
  return NextResponse.json({
    totalCostUsd: agg.totalCostUsd ?? 0,
    activeUsers:  (agg.activeUsers ?? []).length,
    convToday,
    byUser,
    byModel,
  });
}

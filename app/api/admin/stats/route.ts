import { connectDB } from "@/lib/mongodb";
import { UserUsage } from "@/models/user-usage";
import { Conversation } from "@/models/conversation";
import { getMgmtClient } from "@/lib/mgmt";
import { getDevUserIds } from "@/lib/dev-users";
import { NextResponse } from "next/server";

export async function GET() {
  await connectDB();

  const mgmt = getMgmtClient();
  const [auth0UsersPage, devUserIds] = await Promise.all([
    mgmt.users.list({ per_page: 100 }),
    getDevUserIds(),
  ]);
  const auth0Users = (auth0UsersPage as any).data as any[];
  const emailMap = Object.fromEntries(auth0Users.map((u: any) => [u.user_id, u.email]));

  const devIdList = [...devUserIds];
  const excludeDevFilter = devIdList.length > 0 ? [{ $match: { userId: { $nin: devIdList } } }] : [];

  const [usageAgg, byModel, convToday, byUserAgg] = await Promise.all([
    UserUsage.aggregate([
      ...excludeDevFilter,
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
      ...excludeDevFilter,
      { $group: { _id: "$modelId", costUsd: { $sum: "$totalCostUsd" } } },
      { $project: { modelId: "$_id", costUsd: 1, _id: 0 } },
      { $sort: { costUsd: -1 } },
    ]),
    Conversation.countDocuments({
      createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    }),
    UserUsage.aggregate([
      ...excludeDevFilter,
      { $group: { _id: "$userId", costUsd: { $sum: "$totalCostUsd" } } },
      { $sort: { costUsd: -1 } },
    ]),
  ]);

  const byUser = byUserAgg.slice(0, 10).map((u: any) => ({
    userId: u._id,
    name: emailMap[u._id] ?? u._id,
    costUsd: u.costUsd,
  }));

  const agg = usageAgg[0] ?? {};
  return NextResponse.json({
    totalCostUsd: agg.totalCostUsd ?? 0,
    activeUsers:  (agg.activeUsers ?? []).length,
    convToday,
    byUser,
    byModel,
  });
}

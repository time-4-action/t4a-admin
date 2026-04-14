import { connectDB } from "@/lib/mongodb";
import { UserUsage } from "@/models/user-usage";
import { UserLimit } from "@/models/user-limit";
import { getMgmtClient } from "@/lib/mgmt";
import { getDevUserIds } from "@/lib/dev-users";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  try {
    await connectDB();
    const mgmt = getMgmtClient();

    const [auth0UsersPage, usageDocs, limitDocs, devUserIds] = await Promise.all([
      mgmt.users.list({ per_page: 100 }),
      UserUsage.aggregate([
        { $group: { _id: "$userId", totalCostUsd: { $sum: "$totalCostUsd" } } },
      ]),
      UserLimit.find({}),
      getDevUserIds(),
    ]);
    const auth0Users = (auth0UsersPage as any).data as any[];

    const usageMap = Object.fromEntries(usageDocs.map((u) => [u._id, u.totalCostUsd]));
    const limitMap = Object.fromEntries(limitDocs.map((l) => [l.userId, l]));

    // Only fetch roles for non-dev users (dev users are filtered out)
    const visibleUsers = auth0Users.filter((u) => !devUserIds.has(u.user_id));
    const rolesResults = await Promise.all(
      visibleUsers.map((u) =>
        mgmt.users.roles.list(u.user_id).then((p) => ((p as any).data as any[]).map((r: any) => r.name)).catch(() => [])
      )
    );

    const users = visibleUsers.map((u, i) => ({
      id:           u.user_id,
      name:         u.name,
      email:        u.email,
      picture:      u.picture,
      totalCostUsd: usageMap[u.user_id!] ?? 0,
      limit:        limitMap[u.user_id!] ?? null,
      roles:        rolesResults[i],
    }));

    return NextResponse.json(users);
  } catch (err) {
    console.error("GET /api/admin/users error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, username, email, password, connection } = await req.json();
    const mgmt = getMgmtClient();
    const created = await mgmt.users.create({
      connection: connection ?? process.env.AUTH0_DB_CONNECTION ?? "Username-Password-Authentication",
      name,
      username,
      email,
      password,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/users error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

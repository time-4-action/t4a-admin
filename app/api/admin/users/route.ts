import { connectDB } from "@/lib/mongodb";
import { UserUsage } from "@/models/user-usage";
import { UserLimit } from "@/models/user-limit";
import { getMgmtClient } from "@/lib/mgmt";
import { listAllUsers, getRolesByUserId } from "@/lib/auth0-mgmt";
import { isDevRole } from "@/lib/ai-role";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  try {
    await connectDB();

    // Roles are resolved via a single inverted walk over the (few) roles rather
    // than one call per user, so the result is complete and doesn't rate-limit.
    const [auth0Users, usageDocs, limitDocs, { rolesByUser }] = await Promise.all([
      listAllUsers(),
      UserUsage.aggregate([
        { $group: { _id: "$userId", totalCostUsd: { $sum: "$totalCostUsd" } } },
      ]),
      UserLimit.find({}),
      getRolesByUserId(),
    ]);

    const usageMap = Object.fromEntries(usageDocs.map((u) => [u._id, u.totalCostUsd]));
    const limitMap = Object.fromEntries(limitDocs.map((l) => [l.userId, l]));

    // Dev users are hidden from the list; derived from the same role map.
    const users = auth0Users
      .filter((u) => !(rolesByUser.get(u.user_id) ?? []).some(isDevRole))
      .map((u) => ({
        id:           u.user_id,
        name:         u.name,
        email:        u.email,
        picture:      u.picture,
        totalCostUsd: usageMap[u.user_id!] ?? 0,
        limit:        limitMap[u.user_id!] ?? null,
        roles:        rolesByUser.get(u.user_id) ?? [],
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

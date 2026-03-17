import { connectDB } from "@/lib/mongodb";
import { UserLimit } from "@/models/user-limit";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { limitUsd, period }: { limitUsd: number; period: string } = await req.json();
  const { id } = await params;
  const userId = decodeURIComponent(id);
  await connectDB();

  await UserLimit.findOneAndUpdate(
    { userId },
    {
      $set: {
        limitUsd,
        period,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        currentSpendUsd: 0,
        periodStart: new Date(),
      },
    },
    { upsert: true }
  );

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth0 } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { BuilderPreset, type IBuilderPreset } from "@/models/builder-preset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

function view(d: IBuilderPreset) {
  return {
    id: String(d._id),
    builder: d.builder,
    name: d.name,
    config: d.config,
    updatedAt: d.updatedAt,
  };
}

// PATCH /api/builder/presets/[id] — rename and/or overwrite the config. Scoped to
// the owner (userId), so a user can only touch their own saves.
export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await auth0.getSession();
  const sub = session?.user?.sub;
  if (!sub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!mongoose.isValidObjectId(id))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { name?: string; config?: unknown };
  const update: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const n = body.name.trim();
    if (!n) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    update.name = n;
  }
  if (body.config != null) update.config = body.config;
  if (!Object.keys(update).length)
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  await connectDB();
  const doc = (await BuilderPreset.findOneAndUpdate({ _id: id, userId: sub }, update, {
    new: true,
  }).exec()) as IBuilderPreset | null;
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ preset: view(doc) });
}

// DELETE /api/builder/presets/[id] — remove one of the user's saves.
export async function DELETE(_request: Request, { params }: RouteParams) {
  const session = await auth0.getSession();
  const sub = session?.user?.sub;
  if (!sub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!mongoose.isValidObjectId(id))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await connectDB();
  const res = await BuilderPreset.deleteOne({ _id: id, userId: sub }).exec();
  if (!res.deletedCount) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

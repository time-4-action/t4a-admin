import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import {
  BuilderPreset,
  MAX_PRESET_VERSIONS,
  type IBuilderPreset,
} from "@/models/builder-preset";
import { sessionActor, detailView, snapshotCurrent } from "../../helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/builder/presets/[id]/revert — restore a version from the history.
// The current config is snapshotted first, so a revert is itself revertible.
export async function POST(request: Request, { params }: RouteParams) {
  const actor = await sessionActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!mongoose.isValidObjectId(id))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { versionId?: string };
  const versionId = String(body.versionId ?? "");
  if (!mongoose.isValidObjectId(versionId))
    return NextResponse.json({ error: "versionId is required" }, { status: 400 });

  await connectDB();
  const doc = (await BuilderPreset.findById(id).exec()) as IBuilderPreset | null;
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const version = doc.versions.find((v) => String(v._id) === versionId);
  if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  snapshotCurrent(doc, MAX_PRESET_VERSIONS);
  doc.config = version.config;
  doc.versionLabel = version.label ? `Restored · ${version.label}` : "Restored version";
  doc.markModified("config");
  doc.updatedBy = actor;
  await doc.save();
  return NextResponse.json({ preset: detailView(doc) });
}

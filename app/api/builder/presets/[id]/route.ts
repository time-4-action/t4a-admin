import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import {
  BuilderPreset,
  MAX_PRESET_VERSIONS,
  type IBuilderPreset,
} from "@/models/builder-preset";
import { sessionActor, detailView, snapshotCurrent } from "../helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/builder/presets/[id] — full detail: config, notes, version history.
export async function GET(_request: Request, { params }: RouteParams) {
  const actor = await sessionActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!mongoose.isValidObjectId(id))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await connectDB();
  const doc = (await BuilderPreset.findById(id).exec()) as IBuilderPreset | null;
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ preset: detailView(doc) });
}

// PATCH /api/builder/presets/[id] — rename and/or overwrite the config. Saves
// are shared: anyone with builder access may edit; the editor is stamped and a
// config overwrite pushes the previous state onto the version history.
export async function PATCH(request: Request, { params }: RouteParams) {
  const actor = await sessionActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!mongoose.isValidObjectId(id))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    config?: unknown;
    versionLabel?: string;
  };
  const hasName = typeof body.name === "string";
  const name = hasName ? String(body.name).trim() : "";
  const versionLabel = String(body.versionLabel || "").trim();
  if (hasName && !name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!hasName && body.config == null)
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  // Every config save must be named, so the history stays readable.
  if (body.config != null && !versionLabel)
    return NextResponse.json({ error: "Version name is required" }, { status: 400 });

  await connectDB();
  const doc = (await BuilderPreset.findById(id).exec()) as IBuilderPreset | null;
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.config != null) {
    snapshotCurrent(doc, MAX_PRESET_VERSIONS);
    doc.config = body.config;
    doc.versionLabel = versionLabel;
    doc.markModified("config");
  }
  if (hasName) doc.name = name;
  doc.updatedBy = actor;
  await doc.save();
  return NextResponse.json({ preset: detailView(doc) });
}

// DELETE /api/builder/presets/[id] — remove a saved build (shared — any user
// with builder access may delete).
export async function DELETE(_request: Request, { params }: RouteParams) {
  const actor = await sessionActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!mongoose.isValidObjectId(id))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await connectDB();
  const res = await BuilderPreset.deleteOne({ _id: id }).exec();
  if (!res.deletedCount) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

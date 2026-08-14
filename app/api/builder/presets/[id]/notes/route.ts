import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { BuilderPreset, type IBuilderPreset } from "@/models/builder-preset";
import { sessionActor, detailView } from "../../helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/builder/presets/[id]/notes — add a note to a saved build. The
// author is stamped from the session (like partner/warranty notes).
export async function POST(request: Request, { params }: RouteParams) {
  const actor = await sessionActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!mongoose.isValidObjectId(id))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { text?: string };
  const text = String(body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "Note text is required" }, { status: 400 });
  if (text.length > 4000)
    return NextResponse.json({ error: "Note is too long" }, { status: 400 });

  await connectDB();
  const doc = (await BuilderPreset.findById(id).exec()) as IBuilderPreset | null;
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  doc.notes.push({ author: actor, text, createdAt: new Date() } as IBuilderPreset["notes"][number]);
  await doc.save();
  return NextResponse.json({ preset: detailView(doc) }, { status: 201 });
}

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { BuilderPreset, type IBuilderPreset } from "@/models/builder-preset";
import { sessionActor, detailView } from "../../../helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string; noteId: string }> };

// DELETE /api/builder/presets/[id]/notes/[noteId] — remove one's own note.
export async function DELETE(_request: Request, { params }: RouteParams) {
  const actor = await sessionActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, noteId } = await params;
  if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(noteId))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await connectDB();
  const doc = (await BuilderPreset.findById(id).exec()) as IBuilderPreset | null;
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const note = doc.notes.find((n) => String(n._id) === noteId);
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Only the author may delete their note.
  if (note.author?.id !== actor.id)
    return NextResponse.json({ error: "You can only delete your own notes" }, { status: 403 });

  doc.notes = doc.notes.filter((n) => String(n._id) !== noteId);
  await doc.save();
  return NextResponse.json({ preset: detailView(doc) });
}

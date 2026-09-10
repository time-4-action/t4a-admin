import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { BuilderPreset, type IBuilderPreset } from "@/models/builder-preset";
import { VALID_BUILDERS, sessionActor, summaryView } from "./helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/builder/presets?builder=radar-chart — ALL saved builds (shared
// across everyone with builder access), newest-edited first.
export async function GET(request: Request) {
  const actor = await sessionActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const builder = new URL(request.url).searchParams.get("builder") || undefined;
  const query: Record<string, unknown> = {};
  if (builder) query.builder = builder;

  await connectDB();
  const docs = (await BuilderPreset.find(query)
    .sort({ updatedAt: -1 })
    .exec()) as IBuilderPreset[];
  return NextResponse.json({ presets: docs.map(summaryView) });
}

// POST /api/builder/presets — save the current build under a name.
export async function POST(request: Request) {
  const actor = await sessionActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    builder?: string;
    name?: string;
    config?: unknown;
    versionLabel?: string;
  };
  const builder = String(body.builder || "");
  const name = String(body.name || "").trim();
  const versionLabel = String(body.versionLabel || "").trim();
  if (!VALID_BUILDERS.has(builder))
    return NextResponse.json({ error: "Unknown builder" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!versionLabel)
    return NextResponse.json({ error: "Version name is required" }, { status: 400 });
  if (body.config == null) return NextResponse.json({ error: "Config is required" }, { status: 400 });

  await connectDB();
  const doc = await BuilderPreset.create({
    userId: actor.id,
    userEmail: actor.email || null,
    userName: actor.name || null,
    builder,
    name,
    config: body.config,
    versionLabel,
    updatedBy: actor,
  });
  return NextResponse.json({ preset: summaryView(doc) }, { status: 201 });
}

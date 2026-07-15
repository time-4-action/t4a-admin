import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { BuilderPreset, type IBuilderPreset } from "@/models/builder-preset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_BUILDERS = new Set(["radar-chart", "range-bars"]);

function view(d: IBuilderPreset) {
  return {
    id: String(d._id),
    builder: d.builder,
    name: d.name,
    config: d.config,
    updatedAt: d.updatedAt,
  };
}

// GET /api/builder/presets?builder=radar-chart — the current user's saved builds.
export async function GET(request: Request) {
  const session = await auth0.getSession();
  const sub = session?.user?.sub;
  if (!sub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const builder = new URL(request.url).searchParams.get("builder") || undefined;
  const query: Record<string, unknown> = { userId: sub };
  if (builder) query.builder = builder;

  await connectDB();
  const docs = (await BuilderPreset.find(query).sort({ updatedAt: -1 }).exec()) as IBuilderPreset[];
  return NextResponse.json({ presets: docs.map(view) });
}

// POST /api/builder/presets — save the current build under a name.
export async function POST(request: Request) {
  const session = await auth0.getSession();
  const sub = session?.user?.sub;
  if (!sub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    builder?: string;
    name?: string;
    config?: unknown;
  };
  const builder = String(body.builder || "");
  const name = String(body.name || "").trim();
  if (!VALID_BUILDERS.has(builder))
    return NextResponse.json({ error: "Unknown builder" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (body.config == null) return NextResponse.json({ error: "Config is required" }, { status: 400 });

  await connectDB();
  const doc = await BuilderPreset.create({
    userId: sub,
    userEmail: session?.user?.email ?? null,
    builder,
    name,
    config: body.config,
  });
  return NextResponse.json({ preset: view(doc) }, { status: 201 });
}

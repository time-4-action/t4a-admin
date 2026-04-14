import { connectDB } from "@/lib/mongodb";
import { NextResponse } from "next/server";
import mongoose from "mongoose";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const { id: userId } = await params;

    const docs = await mongoose.connection.db!
      .collection("conversations")
      .find({ userId }, { sort: { createdAt: -1 } })
      .toArray();

    const conversations = docs.map((d) => ({
      id: d._id.toString(),
      title: d.title ?? "Untitled",
      model: d.model ?? "",
      totalCostUsd: d.totalCostUsd ?? 0,
      createdAt: d.createdAt ?? null,
      updatedAt: d.updatedAt ?? null,
      messageCount: Array.isArray(d.messages) ? d.messages.length : 0,
      messages: Array.isArray(d.messages)
        ? d.messages.map((m: any) => ({
            role: m.role,
            content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
            createdAt: m.createdAt ?? null,
          }))
        : [],
    }));

    return NextResponse.json(conversations);
  } catch (err) {
    console.error("GET /api/admin/users/[id]/conversations error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

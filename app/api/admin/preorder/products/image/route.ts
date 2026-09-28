import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { putPublicObject, s3Configured } from "@/lib/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// After client-side resizing (a photo arrives at a few hundred KB); only GIFs and files
// the browser cannot decode arrive as picked. Stays under the middleware body limit (10 MB).
const MAX_BYTES = 9 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

// POST /api/admin/preorder/products/image — multipart `file` (+ optional `campaignId`)
// → { url }. A product image for a sheet row that has none (MK-only products never
// carry one). Stored in the shared asset bucket under uploads/media/preorder/; the
// sheet saves the returned URL on the row like a catalogue image.
export async function POST(request: Request) {
  if (!s3Configured()) {
    return NextResponse.json({ error: "Image uploads are not configured (S3_* env vars missing)." }, { status: 503 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
  const ext = EXT[file.type];
  if (!ext) return NextResponse.json({ error: "Use a JPG, PNG, WebP, GIF or AVIF image." }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image too large (max 9 MB after resizing — GIFs are not resized)." }, { status: 413 });

  const campaign = String(form?.get("campaignId") ?? "").replace(/[^a-zA-Z0-9_-]/g, "") || "misc";
  const key = `uploads/media/preorder/${campaign}/${randomUUID()}.${ext}`;
  try {
    const url = await putPublicObject(key, new Uint8Array(await file.arrayBuffer()), file.type);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[preorder image upload]", err);
    return NextResponse.json({ error: "Upload failed — try again." }, { status: 502 });
  }
}

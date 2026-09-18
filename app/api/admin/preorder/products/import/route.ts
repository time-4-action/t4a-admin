import { NextResponse } from "next/server";
import { parseSkuWorkbook } from "@/lib/sku-xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

// POST /api/admin/preorder/products/import — multipart `file` (.xlsx) → the SKU /
// EAN codes it carries. Nothing is resolved or saved here: the Import SKUs dialog
// puts the codes in its text box and resolves them like pasted ones.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "file too large (max 5 MB)" }, { status: 413 });
  try {
    const codes = await parseSkuWorkbook(await file.arrayBuffer());
    return NextResponse.json({ codes });
  } catch {
    return NextResponse.json({ error: "Could not read the file — is it an .xlsx?" }, { status: 422 });
  }
}

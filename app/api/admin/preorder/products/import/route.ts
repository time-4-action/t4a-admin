import { NextResponse } from "next/server";
import { parseSkuWorkbookEntries } from "@/lib/sku-xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

// POST /api/admin/preorder/products/import — multipart `file` (.xlsx) → the SKU /
// EAN codes it carries, each with its optional tag (`entries`; `codes` = just the
// codes). Nothing is resolved or saved here: the Import SKUs dialog puts them in its
// text box and resolves them like pasted ones.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "file too large (max 5 MB)" }, { status: 413 });
  try {
    const entries = await parseSkuWorkbookEntries(await file.arrayBuffer());
    return NextResponse.json({ entries, codes: entries.map((e) => e.code) });
  } catch {
    return NextResponse.json({ error: "Could not read the file — is it an .xlsx?" }, { status: 422 });
  }
}

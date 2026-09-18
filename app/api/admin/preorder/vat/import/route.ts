import { NextResponse } from "next/server";
import { allCountryNames } from "@/lib/countries";
import { parseVatWorkbook } from "@/lib/vat-xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

// POST /api/admin/preorder/vat/import — multipart `file` (.xlsx in the template
// layout) → the rates it carries. Nothing is saved: the page merges them into its
// table and autosaves, so the admin sees what changed before it lands.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "file too large (max 5 MB)" }, { status: 413 });
  try {
    const result = await parseVatWorkbook(await file.arrayBuffer(), allCountryNames());
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Could not read the file — is it an .xlsx in the template layout?" }, { status: 422 });
  }
}

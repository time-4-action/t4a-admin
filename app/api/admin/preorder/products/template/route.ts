import { buildSkuTemplateWorkbook, SKU_XLSX_FILENAME } from "@/lib/sku-xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/preorder/products/template — the empty "Import SKUs" .xlsx (one
// SKU / EAN per row) with a sheet explaining how to fill it.
export async function GET() {
  const buf = await buildSkuTemplateWorkbook();
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${SKU_XLSX_FILENAME}"`,
      "Cache-Control": "no-store",
    },
  });
}

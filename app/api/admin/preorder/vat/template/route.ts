import { allCountryNames } from "@/lib/countries";
import { getVatSettings } from "@/lib/vat-settings";
import { buildVatWorkbook, VAT_XLSX_FILENAME } from "@/lib/vat-xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/preorder/vat/template — the VAT table as an .xlsx (Country · Code ·
// VAT %), pre-filled with the current rates: fill it in, import it back.
export async function GET() {
  const settings = await getVatSettings();
  const buf = await buildVatWorkbook(allCountryNames(), settings.rates, settings.fallbackRate);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${VAT_XLSX_FILENAME}"`,
      "Cache-Control": "no-store",
    },
  });
}

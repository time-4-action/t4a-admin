// lib/vat-settings.ts — read / write the global VAT rate table (models/vat-settings.ts).
import "server-only";
import { connectDB } from "@/lib/mongodb";
import { VatSettings } from "@/models/vat-settings";
import { normalizeTaxCodes, normalizeVatRate, normalizeVatRateMap, type VatConfig } from "@/lib/pricing";

export type VatSettingsView = VatConfig & { updatedAt: string | null; updatedBy: string | null };

const EMPTY: VatSettingsView = { rates: {}, fallbackRate: null, taxCodes: [], updatedAt: null, updatedBy: null };

// The current table. An absent document reads as "nothing configured" — the
// resolver then reports every consumer order as vat-missing rather than guessing.
export async function getVatSettings(): Promise<VatSettingsView> {
  await connectDB();
  const doc = await VatSettings.findOne({ key: "vat" }).lean().exec();
  if (!doc) return EMPTY;
  return {
    rates: normalizeVatRateMap(doc.rates),
    fallbackRate: normalizeVatRate(doc.fallbackRate),
    taxCodes: normalizeTaxCodes(doc.taxCodes),
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    updatedBy: doc.updatedBy ?? null,
  };
}

// Full replace (PUT semantics): a country left out of `rates` loses its rate;
// invalid entries are dropped, not "fixed".
export async function saveVatSettings(
  input: { rates: unknown; fallbackRate: unknown; taxCodes?: unknown },
  updatedBy: string | null,
): Promise<VatSettingsView> {
  await connectDB();
  const rates = normalizeVatRateMap(input.rates);
  const fallbackRate = normalizeVatRate(input.fallbackRate);
  const taxCodes = normalizeTaxCodes(input.taxCodes ?? []);
  await VatSettings.findOneAndUpdate(
    { key: "vat" },
    {
      $set: {
        rates: Object.keys(rates)
          .sort()
          .map((iso) => ({ iso, rate: rates[iso] })),
        fallbackRate,
        taxCodes,
        updatedBy,
      },
    },
    { upsert: true, returnDocument: "after" },
  ).exec();
  return getVatSettings();
}

// lib/countries-client.ts
//
// Client-safe country helpers for the Preorder markets map and tables. Deliberately
// tiny: no locale tables live here (the server-side lib/countries.ts owns the
// name → ISO resolution via i18n-iso-countries). English names travel with the
// geo JSON (`properties.name`) and with API responses (`countryName`).

// ISO 3166-1 alpha-2 codes of the countries shown in the default "Europe" map view
// (geographic Europe + the usual B2B trading neighbours). Order is irrelevant.
export const EUROPE_ISO: readonly string[] = [
  "AL", "AD", "AT", "BY", "BE", "BA", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IS", "IE", "IT", "XK", "LV", "LI", "LT", "LU", "MT", "MD", "MC",
  "ME", "NL", "MK", "NO", "PL", "PT", "RO", "RU", "SM", "RS", "SK", "SI", "ES", "SE",
  "CH", "TR", "UA", "GB", "VA", "GE", "AM", "AZ",
];

const EUROPE_SET = new Set(EUROPE_ISO);

export function isEuropean(iso: string | null | undefined): boolean {
  return !!iso && EUROPE_SET.has(iso.toUpperCase());
}

export function normalizeIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const up = iso.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(up) ? up : null;
}

import "server-only";

// lib/countries.ts
//
// Server-side country resolution for the Preorder module. Metakocka's get_partner
// carries NO ISO code — only a localized country NAME on the partner's delivery
// address ("Slovenija", "Nemčija", "Slovenia", …), in whatever language the MK
// register uses. This turns such a name into an ISO 3166-1 alpha-2 code with
// i18n-iso-countries across the languages we trade in, plus an alias table for
// register spellings the package doesn't know. Client code never imports this
// (the locale tables are 10–15 KB each) — see lib/countries-client.ts.

import countries from "i18n-iso-countries";
import en from "i18n-iso-countries/langs/en.json";
import sl from "i18n-iso-countries/langs/sl.json";
import de from "i18n-iso-countries/langs/de.json";
import it from "i18n-iso-countries/langs/it.json";
import hr from "i18n-iso-countries/langs/hr.json";
import fr from "i18n-iso-countries/langs/fr.json";
import es from "i18n-iso-countries/langs/es.json";
import nl from "i18n-iso-countries/langs/nl.json";
import pl from "i18n-iso-countries/langs/pl.json";
import cs from "i18n-iso-countries/langs/cs.json";
import hu from "i18n-iso-countries/langs/hu.json";
import sr from "i18n-iso-countries/langs/sr.json";
import bs from "i18n-iso-countries/langs/bs.json";
import type { MkPartner } from "@/types/documents";
import { normalizeIso } from "@/lib/countries-client";

const LOCALES = [en, sl, de, it, hr, fr, es, nl, pl, cs, hu, sr, bs] as const;
for (const l of LOCALES) countries.registerLocale(l);
const LOCALE_CODES = LOCALES.map((l) => l.locale);

// Spellings seen in MK registers that the locale tables don't cover verbatim.
// Keys are normalized (lowercase, diacritics stripped).
const MK_COUNTRY_ALIASES: Record<string, string> = {
  "velika britanija": "GB",
  "zdruzeno kraljestvo": "GB",
  "uk": "GB",
  "united kingdom": "GB",
  "great britain": "GB",
  "england": "GB",
  "united kingdom - northern ireland": "GB",
  "zda": "US",
  "usa": "US",
  "united states": "US",
  "ceska": "CZ",
  "czech republic": "CZ",
  "czechia": "CZ",
  "bosna in hercegovina": "BA",
  "bosna i hercegovina": "BA",
  "bih": "BA",
  "srbija": "RS",
  "makedonija": "MK",
  "severna makedonija": "MK",
  "north macedonia": "MK",
  "crna gora": "ME",
  "kosovo": "XK",
  "kosovo*": "XK",
  "the netherlands": "NL",
  "holland": "NL",
  "nizozemska": "NL",
  "svica": "CH",
  "schweiz": "CH",
  "suisse": "CH",
  "svizzera": "CH",
  "russia": "RU",
  "rusija": "RU",
  "turkey": "TR",
  "turcija": "TR",
  "turkiye": "TR",
  "moldova": "MD",
  "moldavija": "MD",
  "belorusija": "BY",
  "belarus": "BY",
};

export function normalizeCountryName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Cache: the same handful of names is resolved over and over (every partner sync row).
const cache = new Map<string, string | null>();

// Resolve a country name (any supported language), ISO-2 or ISO-3 code to ISO-2.
// Returns null when nothing matches — callers must treat that as "country missing".
export function countryIsoFromName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const key = normalizeCountryName(trimmed);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  let iso: string | null = null;
  const upper = trimmed.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper) && (countries.isValid(upper) || upper === "XK")) iso = upper;
  else if (/^[A-Z]{3}$/.test(upper) && countries.isValid(upper)) iso = countries.alpha3ToAlpha2(upper) ?? null;
  if (!iso) iso = MK_COUNTRY_ALIASES[key] ?? null;
  if (!iso) {
    for (const locale of LOCALE_CODES) {
      const code = countries.getAlpha2Code(trimmed, locale);
      if (code) {
        iso = code;
        break;
      }
    }
  }
  if (!iso) {
    // Last resort: compare normalized names across every locale (handles diacritics
    // dropped by the MK register, e.g. "Nemcija").
    outer: for (const locale of LOCALE_CODES) {
      const names = countries.getNames(locale, { select: "all" });
      for (const [code, list] of Object.entries(names)) {
        for (const n of list) {
          if (normalizeCountryName(n) === key) {
            iso = code;
            break outer;
          }
        }
      }
    }
  }
  cache.set(key, iso);
  return iso;
}

export type CountrySource = "mk" | "manual" | "home-fallback" | null;

// The company's home country: MK marks domestic partners with foreign_county="false"
// but may leave the address country blank for them.
export function homeCountryIso(): string {
  return normalizeIso(process.env.MK_HOME_COUNTRY) ?? "SI";
}

// Country of a Metakocka partner (billing address), with the home-country fallback for
// domestic partners whose address carries no country.
export function countryIsoFromPartner(
  p: Pick<MkPartner, "address" | "addresses" | "foreignCountry">,
): { iso: string | null; source: CountrySource } {
  const raw = p.address?.country ?? p.addresses?.find((a) => a.country)?.country;
  const iso = countryIsoFromName(raw);
  if (iso) return { iso, source: "mk" };
  if (p.foreignCountry === false) return { iso: homeCountryIso(), source: "home-fallback" };
  return { iso: null, source: null };
}

// English display name for an ISO-2 code (falls back to the code itself).
export function countryName(iso: string | null | undefined): string {
  const code = normalizeIso(iso);
  if (!code) return "";
  if (code === "XK") return "Kosovo";
  return countries.getName(code, "en", { select: "official" }) ?? countries.getName(code, "en") ?? code;
}

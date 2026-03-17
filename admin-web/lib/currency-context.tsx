"use client";
import { createContext, useContext, useState } from "react";
import { EUR_USD_RATE } from "@/lib/currency";

type Currency = "USD" | "EUR";

interface CurrencyContextType {
  currency: Currency;
  toggle: () => void;
  fmt: (usd: number) => string;
  fmtLimit: (limitUsd: number) => string;
  toDisplay: (usd: number) => number;
  toUsd: (display: number) => number;
}

const CurrencyContext = createContext<CurrencyContextType>({
  currency: "EUR",
  toggle: () => {},
  fmt: (usd) => `€${(usd / EUR_USD_RATE).toFixed(2)}`,
  fmtLimit: (usd) => `€${(usd / EUR_USD_RATE).toFixed(2)}`,
  toDisplay: (usd) => usd / EUR_USD_RATE,
  toUsd: (display) => display * EUR_USD_RATE,
});

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrency] = useState<Currency>("EUR");

  const toggle = () => setCurrency((c) => (c === "EUR" ? "USD" : "EUR"));

  const fmt = (usd: number) =>
    currency === "EUR"
      ? `€${(usd / EUR_USD_RATE).toFixed(2)}`
      : `$${usd.toFixed(2)}`;

  const fmtLimit = (usd: number) =>
    currency === "EUR"
      ? `€${(usd / EUR_USD_RATE).toFixed(2)}`
      : `$${usd.toFixed(2)}`;

  const toDisplay = (usd: number) =>
    currency === "EUR" ? usd / EUR_USD_RATE : usd;

  const toUsd = (display: number) =>
    currency === "EUR" ? display * EUR_USD_RATE : display;

  return (
    <CurrencyContext.Provider value={{ currency, toggle, fmt, fmtLimit, toDisplay, toUsd }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}

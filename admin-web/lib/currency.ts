// lib/currency.ts
export const EUR_USD_RATE = parseFloat(process.env.NEXT_PUBLIC_EUR_USD_RATE ?? "1.14");
export const toEur = (usd: number) => usd / EUR_USD_RATE;
export const fmtEur = (usd: number) => `€${toEur(usd).toFixed(2)}`;
export const fmtUsd = (usd: number) => `$${usd.toFixed(4)}`;

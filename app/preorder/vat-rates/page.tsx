import { Percent } from "lucide-react";
import { VatRatesClient } from "./vat-rates-client";

// Preorder → VAT rates: the global per-country VAT table (added on top of the partner
// price for individuals; companies are zero-rated by default).
export default function VatRatesPage() {
  return (
    <div className="flex flex-col h-full">
      <header className="h-14 border-b border-border flex items-center gap-3 px-4 md:px-8 shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <span className="w-8 h-8 rounded-lg bg-lime-500/10 text-lime-700 dark:text-lime-400 flex items-center justify-center shrink-0">
          <Percent className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-lg font-medium tracking-tight text-foreground leading-tight">VAT rates</h1>
          <p className="text-[11px] text-muted-foreground leading-tight">Per-country VAT added to individuals&apos; partner prices · autosaved · campaigns may override</p>
        </div>
      </header>
      <VatRatesClient />
    </div>
  );
}
